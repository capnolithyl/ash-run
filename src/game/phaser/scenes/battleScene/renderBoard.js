import {
  BATTLE_ATTACK_IMPACT_DELAY_MS,
  BATTLE_ATTACK_WINDOW_MS,
  BATTLE_MOVE_SETTLE_MS,
  BATTLE_POST_COMBAT_PAUSE_MS,
  BATTLE_TURN_BANNER_SETTLE_MS
} from "../../../core/constants.js";
import { getBattlefieldLayout } from "../../../core/battlefieldLayout.js";
import { deriveBattleAnimationEvents } from "../../view/battleAnimationEvents.js";
import {
  getBoardSnapshot,
  getHoveredAttackForecast,
  getHoveredMovementPath,
  getTurnTransitionDelay,
  isBattleScreen
} from "./screenState.js";

export function getAnimatedMovementPaths(movementEvents = [], owner = null) {
  return movementEvents
    .filter(
      (event) =>
        event.type === "move" &&
        !event.teleport &&
        event.path?.length > 1 &&
        (!owner || event.owner === owner)
    )
    .map((event) => event.path);
}

export const battleSceneRenderMethods = {
  getBoardLayout(snapshot) {
    return getBattlefieldLayout({
      viewportWidth: this.scale.width,
      viewportHeight: this.scale.height,
      mapWidth: snapshot.map.width,
      mapHeight: snapshot.map.height
    });
  },

  renderBattle() {
    const snapshot = getBoardSnapshot(this.latestState, this.hoveredTile);

    if (!snapshot) {
      this.resetBattlefieldCamera();
      this.cameraBattleKey = null;
      this.gridLayer.clear();
      this.selectionLayer.clear();
      this.buildingLayer.clear();
      this.unitLayer.clear();
      this.fxLayer.clear();
      this.hoveredTile = null;
      this.previousSnapshot = null;
      return;
    }

    const isBattle = isBattleScreen(this.latestState);
    const layout = this.getBoardLayout(snapshot);
    const battleKey = `${this.latestState.screen}:${snapshot.id}:${snapshot.map.id}`;

    if (this.cameraBattleKey !== battleKey) {
      this.cameraBattleKey = battleKey;
      this.resetBattlefieldCamera();
    } else {
      this.clampBattlefieldCamera();
    }

    if (!isBattle) {
      this.fxLayer.clear();
      this.gridLayer.render(snapshot, layout, { useBattlefieldBackdrop: true });
      this.selectionLayer.render(snapshot, layout, false, this.hoveredTile, [], null, {
        editorSpawns: {
          player: snapshot.map.playerSpawns,
          enemy: snapshot.map.enemySpawns
        }
      });
      this.buildingLayer.render(snapshot, layout);
      this.unitLayer.render(snapshot, layout, []);
      this.previousSnapshot = null;
      return;
    }

    const showGrid = this.latestState.metaState.options.showGrid;
    const hoveredMovementPath = getHoveredMovementPath(snapshot, this.hoveredTile);
    const hoveredAttackForecast = getHoveredAttackForecast(snapshot, this.hoveredTile);
    const previousSnapshot =
      this.previousSnapshot?.id === snapshot.id && this.previousSnapshot?.map.id === snapshot.map.id
        ? this.previousSnapshot
        : null;

    if (!previousSnapshot && this.previousSnapshot) {
      this.fxLayer.clear();
    }

    const animationEvents = deriveBattleAnimationEvents(previousSnapshot, snapshot);
    const movementEvents = animationEvents.filter((event) => event.type === "move");
    const enemyMovementPaths = getAnimatedMovementPaths(movementEvents, "enemy");
    const attackEvents = animationEvents
      .filter((event) => event.type === "attack")
      .sort((left, right) => (left.delay ?? 0) - (right.delay ?? 0));
    const experienceEvents = animationEvents.filter((event) => event.type === "experience");
    const deployUnitIds = new Set(
      animationEvents
        .filter((event) => event.type === "deploy")
        .map((event) => event.unitId)
    );
    const destroyUnitIds = new Set(
      animationEvents
        .filter((event) => event.type === "destroy")
        .map((event) => event.unitId)
    );
    const damageByUnitId = new Map();
    const previousUnitsById = previousSnapshot
      ? new Map(
          [...previousSnapshot.player.units, ...previousSnapshot.enemy.units].map((unit) => [
            unit.id,
            unit
          ])
        )
      : new Map();
    const nextUnitsById = new Map(
      [...snapshot.player.units, ...snapshot.enemy.units].map((unit) => [unit.id, unit])
    );

    previousUnitsById.forEach((previousUnit, unitId) => {
      const nextUnit = nextUnitsById.get(unitId);

      if (!nextUnit || nextUnit.current.hp < previousUnit.current.hp) {
        damageByUnitId.set(unitId, {
          nextHp: nextUnit?.current.hp ?? 0,
          maxHealth: previousUnit.stats.maxHealth
        });
      }
    });

    const turnTransitionDelay = getTurnTransitionDelay(previousSnapshot, snapshot);
    this.fxLayer.setScreenShakeEnabled(this.latestState.metaState.options.screenShake !== false);

    this.gridLayer.render(snapshot, layout, { useBattlefieldBackdrop: true });
    this.selectionLayer.render(
      snapshot,
      layout,
      showGrid,
      this.hoveredTile,
      hoveredMovementPath,
      hoveredAttackForecast,
      {
        enemyMovementPaths
      }
    );
    this.buildingLayer.render(snapshot, layout);
    this.unitLayer.render(snapshot, layout, movementEvents, {
      deployUnitIds,
      destroyUnitIds,
      damageByUnitId
    });
    const maxMoveDelay = movementEvents.length
      ? Math.max(
          ...movementEvents.map((event) =>
            event.unitId ? this.unitLayer.getMoveTweenRemaining(event.unitId) : 0
          )
        )
      : 0;
    const destroyEventByUnitId = new Map(
      animationEvents
        .filter((event) => event.type === "destroy")
        .map((event) => [event.unitId, event])
    );
    const combatCutscene = this.latestState?.battleUi?.combatCutscene ?? null;
    const combatCutsceneActive = Boolean(combatCutscene);
    const postCombatPauseMs = combatCutsceneActive ? BATTLE_POST_COMBAT_PAUSE_MS : 0;
    const attackDrivenDestroyUnitIds = new Set(
      attackEvents
        .filter((event) => destroyEventByUnitId.has(event.targetId))
        .map((event) => event.targetId)
    );
    const combatCutsceneDuration = combatCutscene?.durationMs ?? 0;
    const combatFollowThroughStartMs = combatCutsceneDuration + postCombatPauseMs;

    for (const unitId of attackDrivenDestroyUnitIds) {
      this.unitLayer.holdForDestroy(unitId);
    }

    for (const event of animationEvents) {
      if (event.type === "deploy") {
        if (event.fromUnload && event.carrierId) {
          this.fxLayer.schedule(turnTransitionDelay, () => {
            this.unitLayer.queueAfterMovement(
              event.carrierId,
              () => {
                this.unitLayer.playDeploy(event.unitId);
                this.fxLayer.playDeploy(event, layout);
              },
              BATTLE_MOVE_SETTLE_MS
            );
          });
        } else {
          this.fxLayer.schedule(turnTransitionDelay + maxMoveDelay + BATTLE_MOVE_SETTLE_MS, () => {
            this.unitLayer.playDeploy(event.unitId);
            this.fxLayer.playDeploy(event, layout);
          });
        }
      }

      if (event.type === "capture") {
        this.fxLayer.schedule(
          turnTransitionDelay + maxMoveDelay + BATTLE_MOVE_SETTLE_MS,
          () => this.fxLayer.playCapture(event, layout)
        );
      }

      if (event.type === "destroy") {
        if (attackDrivenDestroyUnitIds.has(event.unitId)) {
          continue;
        }

        const destroyStartDelayMs = combatCutsceneActive
          ? Math.max(turnTransitionDelay + (event.delay ?? 0), combatFollowThroughStartMs)
          : turnTransitionDelay + (event.delay ?? 0);

        this.unitLayer.scheduleDestroy(event.unitId, destroyStartDelayMs);
        this.fxLayer.schedule(destroyStartDelayMs, () =>
          this.fxLayer.playDestroy(event, layout)
        );
      }

      if (event.type === "heal" || event.type === "resupply") {
        this.fxLayer.schedule(turnTransitionDelay, () => this.unitLayer.playHeal(event.unitId));
      }
    }

    if (attackEvents.length > 0) {
      /**
       * Attack events stay serialized so movement lead-in, combat-cutscene reveal,
       * damage pips, and delayed destroy effects all resolve in the same order.
       */
      const playAttackSequence = (index = 0) => {
        if (index >= attackEvents.length) {
          return;
        }

        const event = attackEvents[index];
        const cutsceneStep = combatCutscene?.steps?.[index] ?? null;
        const destroyEvent = destroyEventByUnitId.get(event.targetId);
        const attackWindowMs = cutsceneStep?.windowMs ?? BATTLE_ATTACK_WINDOW_MS;
        const impactDelayMs =
          (cutsceneStep?.impactMs ?? 0) - (cutsceneStep?.startMs ?? 0) || BATTLE_ATTACK_IMPACT_DELAY_MS;
        const destroyDelayMs = combatCutsceneActive
          ? Math.max(attackWindowMs, combatFollowThroughStartMs - (cutsceneStep?.startMs ?? 0))
          : attackWindowMs;

        this.unitLayer.playAttack(
          event.attackerId,
          event.toX - event.fromX,
          event.toY - event.fromY,
          {
            impactDelayMs,
            suppressVisuals: combatCutsceneActive,
            onStart: () => {
              if (!combatCutsceneActive) {
                this.fxLayer.playAttack(event, layout);
              }

              if (destroyEvent) {
                this.unitLayer.scheduleDestroy(event.targetId, destroyDelayMs);
                this.fxLayer.schedule(destroyDelayMs, () =>
                  this.fxLayer.playDestroy(destroyEvent, layout)
                );
              }

              this.fxLayer.schedule(attackWindowMs, () => playAttackSequence(index + 1));
            },
            onImpact: () => {
              this.unitLayer.playDamage(event.targetId);

              if (!combatCutsceneActive) {
                this.fxLayer.playDamageNumber(event, layout);
              }
            }
          }
        );
      };

      const firstAttack = attackEvents[0];
      const firstAttackMoveDelay = this.unitLayer.getMoveTweenRemaining(firstAttack.attackerId);
      const combatCutsceneRevealStartMs = combatCutscene?.revealStartMs ?? 0;
      const combatCutsceneLeadInDelay = combatCutsceneActive
        ? Math.max(
            0,
            (combatCutscene?.steps?.[0]?.startMs ?? combatCutscene?.openMs ?? 0) -
              combatCutsceneRevealStartMs
          )
        : 0;

      this.fxLayer.schedule(turnTransitionDelay, () => {
        if (firstAttackMoveDelay > 0) {
          this.unitLayer.queueAfterMovement(
            firstAttack.attackerId,
            () => playAttackSequence(0),
            BATTLE_MOVE_SETTLE_MS + combatCutsceneLeadInDelay
          );
          return;
        }

        if (combatCutsceneLeadInDelay > 0) {
          this.fxLayer.schedule(combatCutsceneLeadInDelay, () => playAttackSequence(0));
          return;
        }

        playAttackSequence(0);
      });
    }

    experienceEvents.forEach((event) => {
      this.fxLayer.schedule(
        Math.max(
          event.startDelayMs ?? (turnTransitionDelay + maxMoveDelay + BATTLE_MOVE_SETTLE_MS),
          combatFollowThroughStartMs
        ),
        () => this.fxLayer.playExperience(event, layout)
      );
    });

    this.fxLayer.playEvents(
      animationEvents.filter(
        (event) =>
          event.type !== "attack" &&
          event.type !== "experience" &&
          event.type !== "capture" &&
          event.type !== "deploy" &&
          event.type !== "destroy"
      ),
      layout,
      {
        baseDelay: turnTransitionDelay
      }
    );
    this.previousSnapshot = structuredClone(snapshot);
  }
};

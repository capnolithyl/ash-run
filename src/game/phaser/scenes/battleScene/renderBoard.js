import {
  BATTLE_ATTACK_IMPACT_DELAY_MS,
  BATTLE_ATTACK_WINDOW_MS,
  BATTLE_MOVE_SETTLE_MS,
  BATTLE_POST_COMBAT_PAUSE_MS,
  BATTLE_TURN_BANNER_SETTLE_MS,
  TURN_SIDES
} from "../../../core/constants.js";
import { getBattlefieldLayout } from "../../../core/battlefieldLayout.js";
import { deriveBattleAnimationEvents } from "../../view/battleAnimationEvents.js";
import {
  createBattleCueContext,
  getImpactCueIds,
  getMovementCueId,
  getNewBattlePresentationEvents,
  getPresentationEventCueId,
  getServiceCueId,
  getWeaponCueId
} from "../../view/battleAudioRouting.js";
import {
  getBoardSnapshot,
  getHoveredAttackForecast,
  getHoveredMovementPath,
  getTurnTransitionDelay,
  isBattleScreen
} from "./screenState.js";

function areMovementPathsEqual(left = [], right = []) {
  return (
    left.length === right.length &&
    left.every((point, index) => point.x === right[index]?.x && point.y === right[index]?.y)
  );
}

function getHeldMovementPath(heldMove = null, owner = null) {
  if (
    !heldMove?.path?.length ||
    heldMove.path.length < 2 ||
    (owner && heldMove.owner !== owner)
  ) {
    return null;
  }

  return heldMove.path;
}

export function getAnimatedMovementPaths(movementEvents = [], owner = null, heldMove = null) {
  const paths = movementEvents
    .filter(
      (event) =>
        event.type === "move" &&
        !event.teleport &&
        event.path?.length > 1 &&
        (!owner || event.owner === owner)
    )
    .map((event) => event.path);
  const heldPath = getHeldMovementPath(heldMove, owner);

  if (heldPath && !paths.some((path) => areMovementPathsEqual(path, heldPath))) {
    paths.push(heldPath);
  }

  return paths;
}

function getCommanderPowerTargetUnitIds(powerEvents = []) {
  return new Set(
    powerEvents.flatMap((event) => (event.targets ?? []).map((target) => target.unitId))
  );
}

export function getCommanderPowerDestroyDelayMs(event, target) {
  if (target?.destroyed !== true) {
    return null;
  }

  return Math.max(0, Number(event?.pulseDurationMs) || 0);
}

function getAudioDirector(scene) {
  return scene.game.registry.get("audioDirector") ?? null;
}

function playBattleCue(scene, cueId, event, snapshot, source, context = {}) {
  if (!cueId) {
    return null;
  }

  return getAudioDirector(scene)?.playCue?.(cueId, {
    ...createBattleCueContext(event, snapshot, source),
    ...context
  });
}

function getMovementLoopKey(snapshot, event) {
  return `movement:${snapshot.id}:${event.unitId}`;
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
    const colorOptions = this.latestState?.metaState?.options ?? {};

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
      this.lastEnemyMoveHoldFxId = null;
      return;
    }

    const isBattle = isBattleScreen(this.latestState);
    const layout = this.getBoardLayout(snapshot);
    const battleKey = `${this.latestState.screen}:${snapshot.id}:${snapshot.map.id}`;

    if (this.cameraBattleKey !== battleKey) {
      this.cameraBattleKey = battleKey;
      this.lastEnemyMoveHoldFxId = null;
      this.resetBattlefieldCamera();
    } else {
      this.clampBattlefieldCamera();
    }

    if (!isBattle) {
      this.fxLayer.clear();
      this.gridLayer.render(snapshot, layout, { useBattlefieldBackdrop: true });
      this.selectionLayer.render(snapshot, layout, false, this.hoveredTile, [], null, {
        colorOptions,
        editorSpawns: {
          player: snapshot.map.playerSpawns,
          enemy: snapshot.map.enemySpawns
        },
        editorReinforcements: snapshot.presentation?.reinforcements,
        showNameTooltips: false
      });
      this.buildingLayer.render(snapshot, layout, colorOptions);
      this.unitLayer.render(snapshot, layout, [], { colorOptions });
      this.previousSnapshot = null;
      this.lastEnemyMoveHoldFxId = null;
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

    const animationEvents = deriveBattleAnimationEvents(
      previousSnapshot,
      snapshot,
      colorOptions
    );
    const presentationEvents = getNewBattlePresentationEvents(previousSnapshot, snapshot);
    const unloadEventsByPassengerId = new Map(
      presentationEvents
        .filter((event) => event.type === "transport" && event.action === "unload")
        .map((event) => [event.passengerId, event])
    );
    const statusEventsByCombatStep = new Map();
    presentationEvents
      .filter((event) => event.type === "status" && event.combatId)
      .forEach((event) => {
        const key = `${event.combatId}:${event.order ?? 0}`;
        const events = statusEventsByCombatStep.get(key) ?? [];
        events.push(event);
        statusEventsByCombatStep.set(key, events);
      });
    const movementEvents = animationEvents.filter((event) => event.type === "move");
    const powerEvents = animationEvents.filter((event) => event.type === "power");
    const powerTargetUnitIds = getCommanderPowerTargetUnitIds(powerEvents);
    const enemyMoveHold = this.latestState?.battleUi?.enemyMoveHold ?? null;
    const enemyMovementPaths = getAnimatedMovementPaths(
      movementEvents,
      TURN_SIDES.ENEMY,
      enemyMoveHold
    );
    const attackEvents = animationEvents
      .filter((event) => event.type === "attack")
      .sort((left, right) => (left.delay ?? 0) - (right.delay ?? 0));
    const attackingUnitIds = new Set(attackEvents.map((event) => event.attackerId));
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
    const restoreByUnitId = new Map(
      animationEvents
        .filter((event) => event.type === "heal" || event.type === "resupply")
        .map((event) => {
          const nextUnit = nextUnitsById.get(event.unitId);

          return nextUnit
            ? [
                event.unitId,
                {
                  type: event.type,
                  amount: event.amount ?? 0,
                  ammoAmount: event.ammoAmount ?? 0,
                  staminaAmount: event.staminaAmount ?? 0,
                  nextHp: nextUnit.current.hp
                }
              ]
            : null;
        })
        .filter(Boolean)
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

    if (turnTransitionDelay > 0) {
      playBattleCue(
        this,
        snapshot.turn.activeSide === TURN_SIDES.PLAYER
          ? "world.turn-player"
          : "world.turn-enemy",
        { x: Math.floor(snapshot.map.width / 2) },
        snapshot,
        "turn",
        { dedupeKey: `turn:${snapshot.id}:${snapshot.turn.number}:${snapshot.turn.activeSide}` }
      );
    }

    this.gridLayer.render(snapshot, layout, { useBattlefieldBackdrop: true });
    this.selectionLayer.render(
      snapshot,
      layout,
      showGrid,
      this.hoveredTile,
      hoveredMovementPath,
      hoveredAttackForecast,
      {
        colorOptions,
        enemyMovementPaths,
        tutorialHighlights: snapshot.presentation?.tutorial?.battlefieldHighlights ?? [],
        showNameTooltips:
          this.latestState.metaState.options.battlefieldNameTooltips !== false
      }
    );
    this.buildingLayer.render(snapshot, layout, colorOptions);
    presentationEvents
      .filter((event) => event.type === "transport" && event.action === "board")
      .forEach((event) => {
        playBattleCue(this, "transport.board", event, snapshot, "transport-board");
      });
    this.unitLayer.render(snapshot, layout, movementEvents, {
      deployUnitIds,
      destroyUnitIds,
      damageByUnitId,
      restoreByUnitId,
      attackingUnitIds,
      colorOptions,
      movementAudio: {
        onStart: (event) => {
          const director = getAudioDirector(this);
          const cueId = getMovementCueId(event.unitTypeId);
          const loopKey = getMovementLoopKey(snapshot, event);
          const context = {
            ...createBattleCueContext(event, snapshot, "movement"),
            dedupeKey: loopKey,
            loopKey
          };

          if (director?.startLoop) {
            director.startLoop(cueId, context);
          } else {
            director?.playCue?.(cueId, context);
          }
        },
        onStop: (event) => {
          getAudioDirector(this)?.stopLoop?.(getMovementLoopKey(snapshot, event));
        },
        onTeleportDeparture: (event) =>
          playBattleCue(
            this,
            "movement.teleport-depart",
            event,
            snapshot,
            "teleport-depart",
            { dedupeKey: `${getMovementLoopKey(snapshot, event)}:depart` }
          ),
        onTeleportArrival: (event) =>
          playBattleCue(
            this,
            "movement.teleport-arrive",
            event,
            snapshot,
            "teleport-arrive",
            { dedupeKey: `${getMovementLoopKey(snapshot, event)}:arrive` }
          )
      }
    });
    this.fxLayer.setColorOptions(colorOptions);

    if (enemyMoveHold?.id && enemyMoveHold.tile) {
      if (this.lastEnemyMoveHoldFxId !== enemyMoveHold.id) {
        this.lastEnemyMoveHoldFxId = enemyMoveHold.id;
        this.fxLayer.playEnemyMoveHold(enemyMoveHold, layout);
      }
    } else {
      this.lastEnemyMoveHoldFxId = null;
    }

    const maxMoveDelay = movementEvents.length
      ? Math.max(
          ...movementEvents.map((event) =>
            event.unitId ? this.unitLayer.getMoveTweenRemaining(event.unitId) : 0
          )
        )
      : 0;

    presentationEvents
      .filter(
        (event) =>
          (event.type === "status" && !event.combatId) ||
          (event.type === "mission" && event.action !== "capture")
      )
      .forEach((event) => {
        this.fxLayer.schedule(
          turnTransitionDelay + maxMoveDelay + (maxMoveDelay > 0 ? BATTLE_MOVE_SETTLE_MS : 0),
          () =>
            playBattleCue(
              this,
              getPresentationEventCueId(event),
              event,
              snapshot,
              `${event.type}:${event.action ?? event.statusType ?? "event"}`
            )
        );
      });
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

    if (combatCutsceneActive) {
      this.scheduleCombatCutsceneCameraFocus(snapshot, layout, combatCutscene);
    } else {
      this.clearCombatCutsceneCameraFocus({ restore: true });
    }

    for (const unitId of attackDrivenDestroyUnitIds) {
      this.unitLayer.holdForDestroy(unitId);
    }

    for (const event of animationEvents) {
      if (event.type === "deploy") {
        if (powerTargetUnitIds.has(event.unitId)) {
          continue;
        }

        if (event.fromUnload && event.carrierId) {
          this.fxLayer.schedule(turnTransitionDelay, () => {
            this.unitLayer.queueAfterMovement(
              event.carrierId,
              () => {
                this.unitLayer.playDeploy(event.unitId);
                this.fxLayer.playDeploy(event, layout);
                const unloadEvent = unloadEventsByPassengerId.get(event.unitId);
                if (unloadEvent) {
                  playBattleCue(
                    this,
                    "transport.unload",
                    unloadEvent,
                    snapshot,
                    "transport-unload"
                  );
                }
                playBattleCue(this, "world.deploy", event, snapshot, "deploy", {
                  dedupeKey: `deploy:${snapshot.id}:${event.unitId}`
                });
              },
              BATTLE_MOVE_SETTLE_MS
            );
          });
        } else {
          this.fxLayer.schedule(turnTransitionDelay + maxMoveDelay + BATTLE_MOVE_SETTLE_MS, () => {
            this.unitLayer.playDeploy(event.unitId);
            this.fxLayer.playDeploy(event, layout);
            playBattleCue(this, "world.deploy", event, snapshot, "deploy", {
              dedupeKey: `deploy:${snapshot.id}:${event.unitId}`
            });
          });
        }
      }

      if (event.type === "capture") {
        this.fxLayer.schedule(
          turnTransitionDelay + maxMoveDelay + BATTLE_MOVE_SETTLE_MS,
          () => {
            this.fxLayer.playCapture(event, layout);
            playBattleCue(this, "world.capture", event, snapshot, "capture", {
              dedupeKey: `capture:${snapshot.id}:${event.buildingId}`
            });
          }
        );
      }

      if (event.type === "destroy") {
        if (powerTargetUnitIds.has(event.unitId)) {
          continue;
        }

        if (attackDrivenDestroyUnitIds.has(event.unitId)) {
          continue;
        }

        const destroyStartDelayMs = combatCutsceneActive
          ? Math.max(turnTransitionDelay + (event.delay ?? 0), combatFollowThroughStartMs)
          : event.startDelayMs ?? turnTransitionDelay + (event.delay ?? 0);

        this.unitLayer.scheduleDestroy(event.unitId, destroyStartDelayMs);
        this.fxLayer.schedule(destroyStartDelayMs, () => {
          this.fxLayer.playDestroy(event, layout);
          playBattleCue(this, "impact.destroy", event, snapshot, "destroy", {
            dedupeKey: `destroy:${snapshot.id}:${event.unitId}`
          });
        });
      }

      if (event.type === "heal" || event.type === "resupply") {
        if (powerTargetUnitIds.has(event.unitId)) {
          continue;
        }

        this.fxLayer.schedule(event.startDelayMs ?? turnTransitionDelay, () => {
          this.unitLayer.playRestore(event.unitId, {
            tone: event.type === "heal" ? "heal" : "resupply"
          });
          playBattleCue(this, getServiceCueId(event), event, snapshot, "service");
        });
      }
    }

    powerEvents.forEach((event) => {
      this.fxLayer.schedule(Math.max(0, (event.startDelayMs ?? 0) - 90), () => {
        this.fxLayer.playCommanderPowerWave(event, layout);
        playBattleCue(
          this,
          `commander.${event.commanderId}`,
          event,
          snapshot,
          "commander",
          { dedupeKey: `commander:${snapshot.id}:${event.activationId}` }
        );
      });

      (event.targets ?? []).forEach((target, index) => {
        const targetDelayMs =
          (event.startDelayMs ?? 0) + index * (event.targetStaggerMs ?? 0);

        this.unitLayer.preparePowerEffect(target.unitId);
        this.fxLayer.schedule(targetDelayMs, () => {
          if (target.pulse === "damage") {
            this.unitLayer.playDamage(target.unitId);
          } else if (target.pulse === "restore") {
            this.unitLayer.playRestore(target.unitId, { tone: "power-heal" });
          } else if (target.pulse === "deploy") {
            if (deployUnitIds.has(target.unitId)) {
              this.unitLayer.playDeploy(target.unitId);
              this.fxLayer.playDeploy(
                {
                  owner: target.owner,
                  x: target.x,
                  y: target.y
                },
                layout
              );
              playBattleCue(this, "world.reinforcement", target, snapshot, "reinforcement", {
                dedupeKey: `reinforcement:${event.activationId}:${target.unitId}`
              });
            }
          } else {
            this.unitLayer.playPowerPulse(target.unitId, target.pulse);
          }

          this.fxLayer.playCommanderPowerTarget(target, layout, event);

          const destroyDelayMs = getCommanderPowerDestroyDelayMs(event, target);

          if (destroyDelayMs !== null) {
            const destroyEvent = destroyEventByUnitId.get(target.unitId) ?? {
              type: "destroy",
              unitId: target.unitId,
              owner: target.owner,
              x: target.x,
              y: target.y
            };

            this.unitLayer.scheduleDestroy(target.unitId, destroyDelayMs);
            this.fxLayer.schedule(destroyDelayMs, () => {
              this.fxLayer.playDestroy(destroyEvent, layout);
              playBattleCue(this, "impact.destroy", destroyEvent, snapshot, "destroy", {
                dedupeKey: `destroy:${snapshot.id}:${target.unitId}`
              });
            });
          }
        });
      });
    });

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
            durationMs: attackWindowMs,
            suppressVisuals: combatCutsceneActive,
            onStart: () => {
              playBattleCue(this, getWeaponCueId(event), event, snapshot, "weapon", {
                dedupeKey: `weapon:${snapshot.id}:${event.eventId ?? `${event.attackerId}:${index}`}`
              });

              if (!combatCutsceneActive) {
                this.fxLayer.playAttack(event, layout);
              }

              if (destroyEvent) {
                this.unitLayer.scheduleDestroy(event.targetId, destroyDelayMs);
                this.fxLayer.schedule(destroyDelayMs, () => {
                  this.fxLayer.playDestroy(destroyEvent, layout);
                  playBattleCue(this, "impact.destroy", destroyEvent, snapshot, "destroy", {
                    dedupeKey: `destroy:${snapshot.id}:${destroyEvent.unitId}`
                  });
                });
              }

              this.fxLayer.schedule(attackWindowMs, () => playAttackSequence(index + 1));
            },
            onImpact: () => {
              this.unitLayer.playDamage(event.targetId);

              getImpactCueIds(event).forEach((cueId) => {
                playBattleCue(this, cueId, event, snapshot, "impact", {
                  dedupeKey: `impact:${snapshot.id}:${event.eventId ?? `${event.attackerId}:${index}`}:${cueId}`
                });
              });

              (
                statusEventsByCombatStep.get(
                  `${event.combatId}:${event.strikeOrder ?? 0}`
                ) ?? []
              ).forEach((statusEvent) => {
                playBattleCue(
                  this,
                  getPresentationEventCueId(statusEvent),
                  statusEvent,
                  snapshot,
                  `status:${statusEvent.action}`
                );
              });

              if (!combatCutsceneActive) {
                this.fxLayer.playDamageNumber(event, layout);
              }
            }
          }
        );
      };

      const firstAttack = attackEvents[0];
      const firstAttackMoveDelay = this.unitLayer.getMoveTweenRemaining(firstAttack.attackerId);
      const combatCutsceneFocusStartMs = combatCutscene?.focusStartMs ?? 0;
      const combatCutsceneLeadInDelay = combatCutsceneActive
        ? Math.max(
            0,
            (combatCutscene?.steps?.[0]?.startMs ?? combatCutscene?.openMs ?? 0) -
              combatCutsceneFocusStartMs
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
      const experienceStartDelay = Math.max(
        event.startDelayMs ?? (turnTransitionDelay + maxMoveDelay + BATTLE_MOVE_SETTLE_MS),
        combatFollowThroughStartMs
      );
      const experienceDelayOffset = experienceStartDelay - (event.startDelayMs ?? 0);
      const experienceKey = `${snapshot.id}:${event.unitId}:${event.previousLevel}:${event.nextLevel}:${event.previousExperience}:${event.nextExperience}`;

      this.fxLayer.schedule(experienceStartDelay, () => {
        this.fxLayer.playExperience(event, layout);
        playBattleCue(this, "progression.xp", event, snapshot, "experience", {
          dedupeKey: `xp:${experienceKey}`
        });
      });

      (event.thresholdHitDelaysMs ?? []).forEach((thresholdDelay, index) => {
        const effectiveThresholdDelay = thresholdDelay + experienceDelayOffset;
        this.fxLayer.schedule(effectiveThresholdDelay, () =>
          playBattleCue(this, "progression.threshold", event, snapshot, "experience-threshold", {
            dedupeKey: `xp-threshold:${experienceKey}:${index}`
          })
        );
      });
    });

    this.fxLayer.playEvents(
      animationEvents.filter(
        (event) =>
          event.type !== "power" &&
          event.type !== "attack" &&
          event.type !== "experience" &&
          event.type !== "capture" &&
          event.type !== "deploy" &&
          event.type !== "destroy" &&
          !(powerTargetUnitIds.has(event.unitId) && (event.type === "heal" || event.type === "resupply"))
      ),
      layout,
      {
        baseDelay: turnTransitionDelay
      }
    );
    this.previousSnapshot = structuredClone(snapshot);
  }
};

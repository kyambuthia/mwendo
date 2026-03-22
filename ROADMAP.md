# Production Active-Ragdoll Roadmap

This roadmap is for the publishable library in `src/lib`, not for demo-only scaffolding. The demo exists to inspect runtime behavior over LAN and in-browser, but the shipping work belongs in the library codepath.

The chosen controller family is documented in [RESEARCH.md](./RESEARCH.md): a `SIMBICON`-style finite-state controller with `capture-point` stepping heuristics and later directional extensions inspired by `Generalized Biped Walking Control`.

## Program constraints

The controller must meet these constraints from day one:

- fixed-step deterministic behavior under Rapier
- no neural inference in the locomotion hot path
- bounded per-frame cost proportional to joint count
- debuggable state transitions and failure reasons
- production-capable on mobile and PC

That means:

- reduce DOFs aggressively where full articulation is not essential
- prefer explicit state machines over opaque blended controllers
- compute only the metrics we can act on in the same frame
- make visual debugging cheap enough to leave available during day-to-day development

## What is not Rapier's fault

The current instability should not be framed as a physics-engine failure.

These problems are primarily on the controller side:

- high center of mass plus small feet creates inverted-pendulum instability in any rigid-body engine
- gait FSM quality is entirely a controller-design problem
- balance strategy quality is engine-agnostic:
  - capture-point logic
  - PD torque design
  - support switching
  - step placement

Implication:

- do not treat engine swapping as the main path to a fix
- treat morphology, support geometry, gait logic, and balance control as the main tuning surface
- when the active ragdoll fails to stand or walk, first inspect COM location, support area, joint authority, and state-machine transitions before blaming collision callbacks or solver behavior

## Runtime architecture target

The intended production control pipeline is:

1. `Input command layer`
2. `Locomotion mode selection`
3. `Gait phase / support-state machine`
4. `Balance and step planning`
5. `Joint target synthesis`
6. `Motor drive layer`
7. `Failure detection and recovery`

The main runtime state should eventually include:

- `q`, `qdot`: articulated joint positions and velocities
- `x_pelvis`, `x_chest`, `x_com`: world-space root and COM signals
- `supportState`: `none | left | right | double`
- `supportPolygon`
- `capturePoint`
- `plannedFootTarget`
- `gaitPhase`
- `commandVelocity`
- `measuredVelocity`
- `movementMode`
- `controllerPhase`
- `failureReason`

## Visual debugging is a production subsystem

Debugging is not demo polish. It is required to ship a controller this physical.

The production debug stack should expose:

- COM position and COM ground projection
- support polygon and current stance foot
- capture point and capture-point error
- planned swing-foot landing target
- current gait phase and state-machine phase
- joint target angle vs measured angle
- joint-limit proximity heatmap
- contact normals and contact lifetime
- transition reason when the controller changes state
- failure reason when the controller gives up on balance and enters recovery
- CPU timing for control, debug sampling, and snapshot publication

Rules:

- all debug metrics originate in `src/lib`
- the demo may render them, but it must not be the only place they are computed
- the hot path must support debug levels such as `off`, `state`, `contacts`, `joints`, and `full`
- heavy debug sampling should be ring-buffered and optional

## Phase 0: Numerical and rig foundation

Status: partially complete

Objective:

- stabilize the articulated body so locomotion tuning is not wasted on a broken skeleton

Theory basis:

- `SIMBICON` assumes a controllable articulated biped
- PhysX and general rigid-body practice strongly favor reduced DOFs and explicit limits for stability

Primary implementation targets:

- `src/lib/components/CharacterCtrlrHumanoidData.ts`
- `src/lib/components/CharacterCtrlrHumanoidRagdoll.tsx`

Tasks:

- finalize body proportions, masses, and joint anchor preload
- use fixed joints where relative motion is not useful for gameplay control
- use revolute joints where only one angular DOF is required
- keep spherical joints only where the controller truly benefits from them
- tune damping, solver iterations, CCD, and contact skin for the articulated player profile
- add bind-pose regression checks for anchor alignment and collider overlap

Exit criteria:

- no persistent self-collapse in idle due to rig definition alone
- no large initial joint preload
- no head/chest or leg-chain overlap in bind pose

Current state:

- joint calibration against live bind pose has been added
- lower-body proportions and anchors have already been revised once
- the rig is still not stable enough in neutral standing, so this phase is not truly closed

## Phase 1: Library-level observability

Status: mostly complete

Objective:

- make the controller measurable before adding more behavior

Theory basis:

- `Capture Point` only helps if COM and support geometry are visible and logged
- `SIMBICON` tuning depends on viewing phase, tracking error, and support timing

Primary implementation targets:

- `src/lib/components/CharacterCtrlrRagdollDebug.tsx`
- `src/lib/CharacterCtrlrProvider.tsx`
- `src/lib/components/CharacterCtrlrActiveRagdollPlayer.tsx`

Tasks:

- publish COM, support polygon, and capture point from the controller
- add planned footfall and current support-foot visualization
- add per-joint target/error overlays for hips, knees, ankles, shoulders, and elbows
- add transition markers when the gait FSM changes state
- add reason-coded failure diagnostics such as `lost_support`, `joint_saturation`, `pelvis_too_low`, and `unstable_yaw`
- add lightweight profiling counters for controller time and debug time

Exit criteria:

- every locomotion failure is explainable from the debug overlay or recorded snapshot
- the debug overlay can be enabled over LAN on mobile without tanking the simulation

Current state:

- locomotion debug state, gait phase, transition reasons, support state, COM, capture point, footfall targets, and recovery state are already exposed from the library
- ragdoll debug pacing has been fixed so pose-attached visualization renders on the current frame
- joint target/error visualization is still incomplete, and profiling counters are not yet a finished tuning surface

## Phase 2: Standing controller and turn-in-place

Status: in progress

Objective:

- establish a stable standing controller before translating the body across the ground

Theory basis:

- `SIMBICON` uses feedback-modulated target poses
- standing is the zero-velocity boundary condition of walking and must work first

Primary implementation target:

- `src/lib/components/CharacterCtrlrActiveRagdollPlayer.tsx`

Tasks:

- define a standing pose vector for pelvis, chest, hips, knees, ankles, shoulders, elbows
- stabilize pelvis pitch/roll and chest pitch/roll in world space
- regulate pelvis height over current support
- hold COM projection inside support polygon in quiet standing
- add turn-in-place control driven by yaw error and heading command
- expose gain schedules for `idle`, `walk`, `run`, `airborne`

Technical notes:

- use stance ankle and hip torques to keep the COM projection near the center of support
- use explicit gain clamping to prevent oscillation under low frame-rate mobile conditions
- prioritize stable yaw tracking over aggressive heading changes

Exit criteria:

- stable idle for long durations without jitter buildup
- controllable turn-in-place without leg collapse or shoulder flail

Current state:

- stand-assist posture targets, dynamic foot planting, support-height regulation, grounded-state hysteresis, delayed jump-contact clearing, and downward Rapier ground probes are implemented
- turn-in-place now has a dedicated standing-path heading controller instead of borrowing translational gait authority
- the controller is still not reliably meeting the exit criteria:
  - long-horizon stability and low-frame-rate/mobile robustness still need repeatable scenario verification
  - first-step walking is improved structurally but still depends on gait and step-placement tuning
  - turn-in-place is better isolated, but it is not yet signed off as product-stable

## Phase 3: Forward walking and running

Status: architecture implemented, tuning incomplete

Objective:

- implement a robust forward locomotion controller before any omnidirectional expansion

Theory basis:

- `SIMBICON`
- `Capture Point`

Primary implementation target:

- `src/lib/components/CharacterCtrlrActiveRagdollPlayer.tsx`

Tasks:

- implement a compact gait FSM such as:
  - `double_support_start`
  - `left_stance_right_swing`
  - `double_support_mid`
  - `right_stance_left_swing`
- synthesize phase-specific targets for hips, knees, ankles, torso lean, and arm counter-swing
- choose swing-foot landing targets from:
  - command velocity
  - measured COM velocity
  - heading error
  - capture-point error
- separate gait cadence from achieved velocity so walk can start from rest
- keep run as a parameterized extension of walk, not a second unrelated controller

Technical notes:

- use `omega_0 = sqrt(g / z_com)` and `x_cp = x_com + v_com / omega_0` as a stepping heuristic
- clamp landing targets to reachable regions relative to pelvis and stance foot
- track phase time and support-contact confirmation separately to avoid premature transitions

Exit criteria:

- stable walk startup from rest
- stable continuous forward walk
- stable transition walk -> run -> walk
- no persistent leg scissoring or foot chatter in steady gait

Current state:

- the controller already contains:
  - an explicit deterministic gait FSM
  - phase-based pose targets
  - COM and capture-point measurement helpers
  - explicit step length, width, and clearance targets
  - swing-foot planning with reachable landing clamps
  - locomotion family configs
  - recovery and deterministic gait re-entry
- this phase is not functionally complete because the active ragdoll still cannot yet be claimed reliable for walk start, sustained gait, or walk/run transitions across validation scenarios
- Mixamo-based target motion is now wired as a hidden reference rig, but it is not yet enough to guarantee physical walking stability

## Phase 4: Backpedal, strafe, and curved locomotion

Status: not started

Objective:

- extend the forward gait into directional movement without losing stability

Theory basis:

- `Generalized Biped Walking Control`

Primary implementation targets:

- `src/lib/components/CharacterCtrlrActiveRagdollPlayer.tsx`
- `src/lib/types.ts`

Tasks:

- parameterize the gait by desired planar velocity instead of only forward speed
- add backpedal as a reduced-speed, higher-stability gait family
- add left/right strafe as explicit gait variants with narrower step width limits
- support curved locomotion under simultaneous translation and heading commands
- add braking and start/stop transitions instead of instantaneous mode switches

Technical notes:

- do not mirror forward gait blindly for backward locomotion
- widen hysteresis on support transitions for strafe/backpedal because lateral stability margins are smaller
- decouple torso facing from instantaneous velocity when the product design wants aim-style movement later

Exit criteria:

- backward locomotion is slower but stable
- strafing does not immediately destabilize the pelvis
- heading changes during locomotion are smooth and measurable

## Phase 5: Jumping, airtime, and landing

Status: partially complete

Objective:

- treat jumping as a dedicated controller mode, not as a walking state with an impulse added

Theory basis:

- standard physically based locomotion practice
- later DeepMimic-style ideas may inform recovery, but not the baseline jump controller

Primary implementation target:

- `src/lib/components/CharacterCtrlrActiveRagdollPlayer.tsx`

Tasks:

- define explicit `takeoff`, `airborne`, and `landing` phases
- prepare takeoff pose by compressing stance chain before impulse
- limit angular momentum injection during takeoff
- add airborne pose stabilization for torso and legs
- detect landing quality from support timing, vertical speed, pelvis attitude, and COM position
- route bad landings into stumble or recovery instead of pretending they are normal locomotion

Exit criteria:

- jump does not explode the chain
- landing can re-enter locomotion only after support is re-established
- bad landings are diagnosable and recoverable

Current state:

- explicit `jumping`, `landing`, `fallen`, and `recovering` states already exist
- jump-contact clearing has been improved and landing no longer relies only on raw foot-collision callbacks
- this phase is still incomplete because landing quality and locomotion re-entry are not yet consistently stable in-scene

## Phase 6: Disturbance rejection and recovery

Status: partially complete

Objective:

- let the controller absorb realistic errors instead of requiring perfect conditions

Theory basis:

- `Capture Point`
- long-term inspiration from `DeepMimic`

Primary implementation targets:

- `src/lib/components/CharacterCtrlrActiveRagdollPlayer.tsx`
- future recovery helpers in `src/lib/components`

Tasks:

- classify disturbances by severity:
  - recover in place
  - recover with a step
  - transition to stumble
  - transition to fall
- add recovery-step logic when capture point exits support polygon
- add controlled stumble states rather than binary success/failure
- add fall-entry criteria based on pelvis height, trunk attitude, support loss duration, and joint saturation
- define deterministic re-entry conditions for locomotion after partial recovery

Exit criteria:

- moderate perturbations produce visible stepping recovery
- severe perturbations fall cleanly instead of exploding numerically
- recovery transitions are traceable from debug output

Current state:

- recovery-state classification and deterministic re-entry paths already exist
- debug output exposes recovery state and recent transitions
- the controller still needs reliable disturbance rejection in practice; current recovery often compensates for a fundamentally unstable stand/walk base instead of a healthy gait

## Phase 7: Production hardening

Status: not started

Objective:

- make the controller suitable for downstream library consumers, not just internal iteration

Primary implementation targets:

- all files in `src/lib`
- tests and docs

Tasks:

- add regression tests for:
  - gait-state transitions
  - support-state changes
  - capture-point step triggers
  - jump phase transitions
  - fall-entry and recovery-entry rules
- add low-overhead snapshot recording for deterministic replay of failures
- split expensive debug rendering from cheap production metrics
- document all public tunables, default gains, and known failure modes
- profile mobile-class behavior and trim allocations from the hot path
- confirm demo-only code remains a thin wrapper over library behavior

Exit criteria:

- `src/lib` contains the complete production control path
- debug data can be replayed or inspected after failure
- docs explain how to tune and ship the active-ragdoll controller

## Immediate execution order

1. Finish Phase 2 for real: stable neutral standing and controllable turn-in-place must work before more gait tuning.
2. Re-tune Phase 3 on top of that stable standing baseline: first step, continuous forward walk, then walk/run transitions.
3. Tighten Phase 1 observability around joint target vs actual error and failure classification so standing/walking failures are measurable, not guessed.
4. Revisit Phase 5 and Phase 6 only after standing and forward gait are trustworthy enough that recovery is not masking a broken base controller.
5. Defer new locomotion families until the forward active-ragdoll path is genuinely shippable.

## Definition of done for the first publishable active-ragdoll release

The first release should not promise everything. It should promise:

- stable idle
- stable turn-in-place
- stable forward walk
- stable forward run
- deterministic jump and landing
- production-grade debug instrumentation
- documented tunables and failure modes

Backward locomotion, strafing, partial-ragdoll reactions, and advanced recovery can land after that baseline is solid.

## Immediate blocker

The current blocker is no longer architecture. It is behavior:

- the active ragdoll still does not reliably stand in a neutral double-support pose
- because stable standing is not yet solved, first-step walking and sustained gait remain unreliable
- all near-term work should be judged against one question first:
  - does this make the active ragdoll stand stably enough to begin tuning the first step?

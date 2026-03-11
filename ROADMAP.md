# Implementation Roadmap

## Guiding principle

Keep gameplay control deterministic and debuggable first, then layer richer active-ragdoll behavior on top. The current capsule player is now a baseline to replace, not the final target.

## Current status

Shipped baseline:

- scoped store and library exports
- keyboard and external-input controller paths
- follow camera with occlusion handling
- explicit movement state snapshots
- primitive block-character player puppet
- full humanoid ragdoll dummy with in-world debug tooling

What is still missing for the real goal:

- a reusable articulated humanoid rig shared by player and dummy
- a controllable active-ragdoll player root
- joint-space pose targets and balance control
- hybrid handoff, collapse, and deterministic recovery

## Phase 0: Legacy baseline

Status: complete

Purpose:

- keep the current repo usable while the active-ragdoll work starts

Completed tasks:

- build a playable third-person capsule controller
- add explicit movement snapshots and callbacks
- ship a separate ragdoll sandbox target with detailed debug overlays

Exit criteria:

- the old controller stays available as a comparison baseline during the transition

## Phase 1: Shared articulated humanoid foundation

Status: in progress

Goal:

- stop treating the controllable character and the ragdoll as two unrelated implementations

Tasks:

- define one shared humanoid body schema for pelvis, chest, head, arms, legs, hands, and feet
- define one shared joint schema for spine, neck, shoulders, elbows, wrists, hips, knees, and ankles
- extract a reusable articulated humanoid rig component out of the current ragdoll dummy
- keep ragdoll debug overlays attached to the shared rig instead of one demo-only component
- support per-body overrides and external refs so future player control code can drive the same articulated rig
- align visual and physics proportions enough that future active control tuning is not fighting two different body layouts

Started in this pass:

- roadmap expanded into implementation phases and tasks
- reusable humanoid ragdoll rig extraction from the dummy
- dummy migration onto the shared articulated rig
- experimental active-ragdoll player root snapshot path
- custom torso-centered camera focus publishing for articulated players

Exit criteria:

- the dummy is a thin wrapper around a reusable articulated humanoid rig
- future player code can mount the same rig and access its rigid bodies and joints directly

## Phase 2: Active-ragdoll root controller

Status: not started

Goal:

- make the player a physically simulated humanoid with a stable authoritative root instead of a capsule

Tasks:

- define what the player root snapshot means for active ragdoll: pelvis, stabilized torso center, or COM-derived root
- publish root position, root velocity, facing, grounded state, and movement mode from articulated bodies back into the store
- decide camera follow semantics for an articulated body so the camera remains readable under impacts
- build a first experimental active-ragdoll player component that mounts the shared humanoid rig
- keep the old capsule player available until the new root contract is stable

Exit criteria:

- there is a controllable articulated player component that updates the existing store contract without breaking the camera path

## Phase 3: Joint-space pose control and balance

Status: not started

Goal:

- replace direct root velocity steering with body-level control that can stand, turn, and absorb impacts

Tasks:

- define target poses for idle, walk, run, crouch, jump, and fall
- add joint-space control targets for spine, hips, knees, shoulders, elbows, head, and feet
- add upright stabilization for pelvis and torso
- add facing control and turn-in-place behavior
- add damping and anti-explosion limits for joint error, angular velocity, and impulses
- expose tuning props for locomotion force, balance torque, turn torque, and air control

Exit criteria:

- the ragdoll can remain upright intentionally instead of only collapsing under physics
- locomotion control is expressed as pose and balance targets, not just velocity writes

## Phase 4: Contact-aware locomotion

Status: in progress

Goal:

- make the articulated player move intentionally across the ground instead of sliding a root body around

Tasks:

- add grounded detection based on feet and support contacts rather than one capsule
- add stance logic for left and right foot support
- add forward locomotion, braking, and turning that preserve balance
- add jump initiation and airborne behavior from articulated support state
- add slope handling and early stair or ledge heuristics
- add failure detection when locomotion loses balance or support

Started in this pass:

- explicit `none | left | right | double` support-state contract
- left and right foot support tracking in the active-ragdoll player
- support-aware lateral centering toward the current support base
- first swing-foot impulse bias when locomotion is grounded

Exit criteria:

- the player can walk, run, crouch, and jump with support-aware behavior
- grounded state is driven by articulated contact logic

## Phase 5: Hybrid handoff, impacts, and collapse

Status: not started

Goal:

- support gameplay transitions between controlled balance and uncontrolled physics without visual or gameplay discontinuities

Tasks:

- define which events cause partial ragdoll, full ragdoll, or no handoff
- add hit reactions that localize force without always collapsing the whole body
- add collapse triggers for large impulses, bad landing states, or explicit gameplay events
- preserve state continuity across handoff so camera and gameplay logic do not teleport
- add controlled re-entry from destabilized states when the body recovers without a full get-up

Exit criteria:

- impacts can destabilize or collapse the player without exploding the rig
- state continuity is maintained across hybrid control transitions

## Phase 6: Recovery and get-up

Status: not started

Goal:

- let the player leave ragdoll deterministically and return to intentional control

Tasks:

- detect prone, supine, seated, kneeling, and tangled recovery starts
- choose a deterministic get-up path from current body orientation and available support
- re-establish pelvis height, torso orientation, and foot support before locomotion resumes
- add temporary recovery state locking so input does not break get-up transitions
- expose recovery lifecycle callbacks for gameplay code

Exit criteria:

- the player can enter and leave full ragdoll without teleporting or tunneling into the floor
- recovery is deterministic enough for gameplay and camera continuity

## Phase 7: Productionization

Status: not started

Goal:

- make the active-ragdoll controller usable as a library instead of a sandbox experiment

Tasks:

- add typecheck and behavior coverage for root snapshots, grounded logic, handoff, and recovery
- profile and trim hot paths in debug and runtime systems
- split experimental debug helpers from the public runtime surface where appropriate
- document the controller contract, tuning props, and failure modes
- add a skinned-mesh attachment path that does not change control architecture
- add demo toggles so the old capsule baseline and new active-ragdoll player can be compared directly

Exit criteria:

- the active-ragdoll controller is stable enough for downstream experimentation
- the old capsule baseline is no longer required for normal demo use

## Immediate implementation order

1. Finish Phase 1 by extracting the reusable articulated humanoid rig and migrating the dummy.
2. Start Phase 2 by mounting that rig in an experimental active-ragdoll player that can publish a root snapshot.
3. Begin Phase 3 only after the new player root contract and camera behavior are stable.

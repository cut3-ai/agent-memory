import assert from 'node:assert/strict';
import test from 'node:test';

import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { Engine } from '@cut3/agent-memory/core/Engine';
import { Unit } from '@cut3/agent-memory/core/Unit';
import { projectUnit } from '@cut3/agent-memory/core/frame';
import {
  BEGIN_PROJECTION,
  END_PROJECTION,
  RESET_PROJECTION,
} from '@cut3/agent-memory/core/projection';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Composition } from '@cut3/agent-memory/units/base/Composition';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { Shot } from '@cut3/agent-memory/units/base/Shot';

class TestUnit extends Unit {
  static kind = 'unit.test';
}

const projectionCounts = new WeakMap();
const childrenReadCounts = new WeakMap();

class ProjectionProbeUnit extends Unit {
  static kind = 'unit.test.projection-probe';

  constructor(unit) {
    super(unit);
    projectionCounts.set(this, { begin: 0, end: 0, reset: 0 });
  }

  [BEGIN_PROJECTION]() {
    projectionCounts.get(this).begin += 1;
    return super[BEGIN_PROJECTION]();
  }

  [RESET_PROJECTION](snapshot) {
    projectionCounts.get(this).reset += 1;
    return super[RESET_PROJECTION](snapshot);
  }

  [END_PROJECTION](snapshot) {
    projectionCounts.get(this).end += 1;
    return super[END_PROJECTION](snapshot);
  }
}

class FirstPassChildrenUnit extends Unit {
  static kind = 'unit.test.first-pass-children';

  constructor(unit) {
    super(unit);
    childrenReadCounts.set(this, 0);
  }

  get children() {
    const count = (childrenReadCounts.get(this) ?? 0) + 1;
    childrenReadCounts.set(this, count);
    return count > 3 ? Object.freeze([]) : super.children;
  }
}

class PairedPrivateVisibilityUnit extends Unit {
  static kind = 'unit.test.paired-private-visibility';
  #calls = 0;

  isVisible() {
    const visible = Math.floor(this.#calls / 2) > 0;
    this.#calls += 1;
    return visible;
  }
}

class CoordinatedTestLook extends Behaviour {
  static kind = 'behaviour.test.coordinated-look';

  onFrame({ frame }) {
    this.unit.opacity = frame / 10;
    this.unit.pose = { ...this.unit.pose, rotate: frame, scaleX: 1.2, scaleY: 0.9 };
    this.unit.effects = { ...this.unit.effects, blur: 4, contrast: 1.3 };
  }
}

class SameKindA extends Behaviour {
  static kind = 'behaviour.test.same-kind';
}

class SameKindB extends Behaviour {
  static kind = 'behaviour.test.same-kind';
}

class StatefulLook extends Behaviour {
  static kind = 'behaviour.test.stateful';
  count = 0;

  onFrame() {
    this.count += 1;
  }
}

class StructuralLook extends Behaviour {
  static kind = 'behaviour.test.structural';

  onFrame() {
    this.unit.add(new TestUnit());
  }
}

class PrivateStatefulLook extends Behaviour {
  static kind = 'behaviour.test.private-stateful';
  #count = 0;

  onFrame() {
    this.#count += 1;
    this.unit.opacity = this.#count;
  }
}

class BrokenOnAdded extends Behaviour {
  static kind = 'behaviour.test.broken-on-added';

  onAdded() {
    this.unit.extra = 'partial';
    this.unit.add(new TestUnit());
    if (this.unit.parent) {
      this.unit.parent.status = 'partial';
      this.unit.parent.add(new TestUnit());
    }
    throw new Error('broken onAdded');
  }
}

class BrokenOnRemoved extends Behaviour {
  static kind = 'behaviour.test.broken-on-removed';

  onRemoved() {
    this.unit.extra = 'partial';
    this.unit.add(new TestUnit());
    if (this.unit.parent) {
      this.unit.parent.status = 'partial';
      this.unit.parent.add(new TestUnit());
    }
    throw new Error('broken onRemoved');
  }
}

class ForeignStateLook extends Behaviour {
  static kind = 'behaviour.test.foreign-state';

  constructor(unit, sibling) {
    super(unit);
    this.sibling = sibling;
  }

  onFrame() {
    this.unit.parent.status = 'changed';
    this.sibling.status = 'changed';
    this.unit.opacity = 0.25;
  }
}

class ParentStructuralLook extends Behaviour {
  static kind = 'behaviour.test.parent-structural';

  onFrame() {
    this.unit.parent.add(new TestUnit());
  }
}

class SiblingStructuralLook extends Behaviour {
  static kind = 'behaviour.test.sibling-structural';

  constructor(unit, sibling) {
    super(unit);
    this.sibling = sibling;
  }

  onFrame() {
    this.sibling.add(new TestUnit());
  }
}

class ThrowingForeignStateLook extends Behaviour {
  static kind = 'behaviour.test.throwing-foreign-state';

  onFrame() {
    this.unit.parent.status = 'partial';
    this.unit.opacity = 0.25;
    throw new Error('broken onFrame');
  }
}

class NonJsonNumberLook extends Behaviour {
  static kind = 'behaviour.test.non-json-number';
  #calls = 0;

  onFrame() {
    this.#calls += 1;
    this.unit.opacity = this.#calls % 2 === 1 ? Number.NaN : Number.POSITIVE_INFINITY;
  }
}

class SignedZeroLook extends Behaviour {
  static kind = 'behaviour.test.signed-zero';
  #calls = 0;

  onFrame() {
    this.#calls += 1;
    this.unit.opacity = this.#calls % 2 === 1 ? -0 : 0;
  }
}

class PairedPrivateStateLook extends Behaviour {
  static kind = 'behaviour.test.paired-private-state';
  #calls = 0;

  onFrame() {
    this.unit.opacity = Math.floor(this.#calls / 2);
    this.#calls += 1;
  }
}

test('Unit owns a real one-parent tree and Behaviour belongs to constructor owner', () => {
  const leaf = new TestUnit();
  const parent = new TestUnit(leaf);
  const second = new TestUnit();
  assert.equal(leaf.parent, parent);
  assert.deepEqual(parent.children, [leaf]);
  assert.throws(() => second.add(leaf), /one parent/u);

  const behaviour = new CoordinatedTestLook(parent);
  parent.add(behaviour);
  assert.equal(parent.behaviours[0].unit, parent);
  assert.throws(() => second.add(behaviour), /constructor/u);
});

test('one stylistic Behaviour may coordinate several visual decisions', () => {
  const unit = new Box(undefined);
  const frameReference = unit.frame;
  const poseReference = unit.pose;
  const baseline = structuredClone({
    effects: unit.effects,
    opacity: unit.opacity,
    pose: unit.pose,
  });
  unit.add(new CoordinatedTestLook(unit));
  const state = projectUnit(unit, { frame: 5 });

  assert.equal(state.opacity, 0.5);
  assert.equal(state.pose.rotate, 5);
  assert.equal(state.pose.scaleX, 1.2);
  assert.equal(state.effects.blur, 4);
  assert.equal(state.effects.contrast, 1.3);
  assert.deepEqual({ effects: unit.effects, opacity: unit.opacity, pose: unit.pose }, baseline);
  assert.equal(unit.frame, frameReference);
  assert.equal(unit.pose, poseReference);
  assert.equal(Object.isFrozen(unit.frame), true);
  assert.equal(Object.isFrozen(unit.pose), true);
});

test('Behaviour identity is static kind and failed onAdded rolls ownership back', () => {
  const unit = new TestUnit();
  unit.add(new SameKindA(unit));
  assert.throws(() => unit.add(new SameKindB(unit)), /already owns/u);

  const brokenOwner = new TestUnit();
  assert.throws(() => brokenOwner.add(new BrokenOnAdded(brokenOwner)), /broken onAdded/u);
  assert.equal(brokenOwner.behaviours.length, 0);
  assert.equal(brokenOwner.children.length, 0);
  assert.equal(Object.hasOwn(brokenOwner, 'extra'), false);

  const attachedOwner = new TestUnit();
  const attachedSibling = new TestUnit();
  const attachedRoot = new TestUnit(attachedOwner);
  attachedRoot.add(attachedSibling);
  attachedRoot.status = 'clean';
  assert.throws(() => attachedOwner.add(new BrokenOnAdded(attachedOwner)), /broken onAdded/u);
  assert.equal(attachedRoot.status, 'clean');
  assert.deepEqual(attachedRoot.children, [attachedOwner, attachedSibling]);
  assert.equal(attachedOwner.behaviours.length, 0);
  assert.equal(attachedOwner.children.length, 0);

  const removedOwner = new TestUnit();
  const removedRoot = new TestUnit(removedOwner);
  removedRoot.status = 'clean';
  const brokenRemoval = new BrokenOnRemoved(removedOwner);
  removedOwner.add(brokenRemoval);
  assert.throws(() => removedOwner.removeBehaviour(brokenRemoval), /broken onRemoved/u);
  assert.deepEqual(removedOwner.behaviours, [brokenRemoval]);
  assert.equal(removedOwner.children.length, 0);
  assert.equal(Object.hasOwn(removedOwner, 'extra'), false);
  assert.equal(removedRoot.status, 'clean');
  assert.deepEqual(removedRoot.children, [removedOwner]);
});

test('frame evaluation rejects observable state divergence and structural tree changes', () => {
  const statefulOwner = new TestUnit();
  statefulOwner.add(new StatefulLook(statefulOwner));
  assert.throws(() => projectUnit(statefulOwner, { frame: 1 }), /read only|Cannot assign/iu);

  const structuralOwner = new TestUnit();
  structuralOwner.add(new StructuralLook(structuralOwner));
  assert.throws(() => projectUnit(structuralOwner, { frame: 1 }), /cannot change Unit ownership/iu);
  assert.equal(structuralOwner.children.length, 0);

  const privateOwner = new Box(undefined);
  privateOwner.add(new PrivateStatefulLook(privateOwner));
  assert.throws(() => projectUnit(privateOwner, { frame: 1 }), /different owner snapshots/u);
});

test('standalone child projection protects and restores its whole root tree', () => {
  const child = new Box(undefined);
  const sibling = new TestUnit();
  const root = new TestUnit(child);
  root.add(sibling);
  root.status = 'root-original';
  sibling.status = 'sibling-original';
  child.add(new ForeignStateLook(child, sibling));

  assert.throws(() => projectUnit(child, { frame: 1 }), /only mutate its owner/u);
  assert.equal(root.status, 'root-original');
  assert.equal(sibling.status, 'sibling-original');
  assert.equal(child.opacity, 1);

  const structuralChild = new TestUnit();
  const structuralRoot = new TestUnit(structuralChild);
  structuralChild.add(new ParentStructuralLook(structuralChild));
  assert.throws(() => projectUnit(structuralChild, { frame: 1 }), /cannot change Unit ownership/iu);
  assert.deepEqual(structuralRoot.children, [structuralChild]);

  const siblingStructuralChild = new TestUnit();
  const structuralSibling = new TestUnit();
  const siblingStructuralRoot = new TestUnit(siblingStructuralChild);
  siblingStructuralRoot.add(structuralSibling);
  siblingStructuralChild.add(new SiblingStructuralLook(siblingStructuralChild, structuralSibling));
  assert.throws(
    () => projectUnit(siblingStructuralChild, { frame: 1 }),
    /cannot change Unit ownership/iu,
  );
  assert.deepEqual(siblingStructuralRoot.children, [siblingStructuralChild, structuralSibling]);
  assert.equal(structuralSibling.children.length, 0);

  const throwingChild = new Box(undefined);
  const throwingRoot = new TestUnit(throwingChild);
  throwingRoot.status = 'clean';
  throwingChild.add(new ThrowingForeignStateLook(throwingChild));
  assert.throws(() => projectUnit(throwingChild, { frame: 1 }), /broken onFrame/u);
  assert.equal(throwingRoot.status, 'clean');
  assert.equal(throwingChild.opacity, 1);
});

test('observable frame consistency compares non-JSON numbers and remembers the same input', () => {
  const nonJsonOwner = new Box(undefined);
  nonJsonOwner.add(new NonJsonNumberLook(nonJsonOwner));
  assert.throws(() => projectUnit(nonJsonOwner, { frame: 1 }), /different owner snapshots/u);

  const signedZeroOwner = new Box(undefined);
  signedZeroOwner.add(new SignedZeroLook(signedZeroOwner));
  assert.throws(() => projectUnit(signedZeroOwner, { frame: 1 }), /different owner snapshots/u);

  const pairedOwner = new Box(undefined);
  pairedOwner.add(new PairedPrivateStateLook(pairedOwner));
  assert.equal(projectUnit(pairedOwner, { frame: 1 }).opacity, 0);
  assert.throws(() => projectUnit(pairedOwner, { frame: 1 }), /same frame input/u);
  assert.equal(pairedOwner.opacity, 1);

  const revisitOwner = new Box(undefined);
  revisitOwner.add(new PairedPrivateStateLook(revisitOwner));
  assert.equal(projectUnit(revisitOwner, { frame: 1 }).opacity, 0);
  assert.equal(projectUnit(revisitOwner, { frame: 2 }).opacity, 1);
  assert.throws(() => projectUnit(revisitOwner, { frame: 1 }), /same frame input/u);
  assert.equal(revisitOwner.opacity, 1);

  const longRevisitOwner = new Box(undefined);
  longRevisitOwner.add(new PairedPrivateStateLook(longRevisitOwner));
  assert.equal(projectUnit(longRevisitOwner, { frame: 0 }).opacity, 0);
  for (let frame = 1; frame <= 256; frame += 1) projectUnit(longRevisitOwner, { frame });
  assert.throws(() => projectUnit(longRevisitOwner, { frame: 0 }), /same frame input/u);
  assert.equal(longRevisitOwner.opacity, 1);
});

test('projection freezes nested data even when its public container was already frozen', () => {
  class FrozenPayloadUnit extends Unit {
    static kind = 'unit.test.frozen-payload';

    constructor() {
      super();
      this.payload = Object.freeze({ nested: { value: 0 } });
    }
  }
  class MutateNestedPayload extends Behaviour {
    static kind = 'behaviour.test.mutate-nested-payload';

    onFrame() {
      this.unit.payload.nested.value = 1;
    }
  }

  const unit = new FrozenPayloadUnit();
  unit.addBehaviour(new MutateNestedPayload(unit));
  assert.throws(() => projectUnit(unit, { frame: 0 }), TypeError);
  assert.equal(unit.payload.nested.value, 0);
});

test('Engine captures and locks a Unit tree once per frame instead of once per node', () => {
  const units = Array.from({ length: 64 }, () => new ProjectionProbeUnit());
  const root = new ProjectionProbeUnit();
  root.add(...units);

  const output = new Engine(root).at({ frame: 4 });
  assert.equal(output.children.length, units.length);

  const counts = [root, ...units].reduce((total, unit) => {
    const current = projectionCounts.get(unit);
    total.begin += current.begin;
    total.reset += current.reset;
    total.end += current.end;
    return total;
  }, { begin: 0, end: 0, reset: 0 });
  const treeSize = units.length + 1;
  assert.deepEqual(counts, { begin: treeSize, end: treeSize, reset: treeSize });
});

test('shared frame projection keeps whole-tree purity, determinism and restoration guards', () => {
  const child = new Box(undefined);
  const sibling = new TestUnit();
  const root = new TestUnit(child);
  root.add(sibling);
  root.status = 'root-original';
  sibling.status = 'sibling-original';
  child.add(new ForeignStateLook(child, sibling));

  assert.throws(() => new Engine(root).at({ frame: 1 }), /only mutate its owner/u);
  assert.equal(root.status, 'root-original');
  assert.equal(sibling.status, 'sibling-original');
  assert.equal(child.opacity, 1);

  const privateOwner = new Box(undefined);
  privateOwner.add(new PrivateStatefulLook(privateOwner));
  const privateRoot = new TestUnit(privateOwner);
  assert.throws(
    () => new Engine(privateRoot).at({ frame: 1 }),
    /different owner snapshots/u,
  );
  assert.equal(privateOwner.opacity, 1);
  assert.deepEqual(privateRoot.children, [privateOwner]);
});

test('frame history includes invisible traversal on non-consecutive revisits', () => {
  const root = new PairedPrivateVisibilityUnit();
  const engine = new Engine(root);

  assert.equal(engine.at({ frame: 1 }), null);
  assert.equal(engine.at({ frame: 2 }).kind, PairedPrivateVisibilityUnit.kind);
  assert.throws(
    () => engine.at({ frame: 1 }),
    /traversal changed for the same frame input/u,
  );
});

test('Engine consumes the locked first-pass child snapshot after projection', () => {
  const child = new TestUnit();
  const root = new FirstPassChildrenUnit(child);

  const output = new Engine(root).at({ frame: 1 });
  assert.equal(output.children.length, 1);
  assert.equal(output.children[0].kind, TestUnit.kind);
  assert.equal(childrenReadCounts.get(root), 3);
});

test('Shot passes local time to descendants while preserving an absolute tree', () => {
  const box = new Box(undefined);
  box.add(new CoordinatedTestLook(box));
  const timeline = new Layer(new Shot(box, { from: 20, duration: 30 }));
  const composition = new Composition(timeline, { duration: 60 });
  const engine = new Engine(composition);

  assert.equal(engine.at({ frame: 19 }).children[0].children.length, 0);
  const active = engine.at({ frame: 25 });
  const projectedBox = active.children[0].children[0].children[0];
  assert.equal(projectedBox.opacity, 0.5);
  assert.equal(projectedBox.pose.rotate, 5);
});

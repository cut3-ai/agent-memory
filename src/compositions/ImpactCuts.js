import { ImpactCutCadence } from '@cut3/agent-memory/behaviours/impact/ImpactCutCadence';
import {
  CollageDepthOutlineImpact,
  PhotoChromaDepthImpact,
  PhotoDepthZoomImpact,
  PhotoPunch2dImpact,
  PhotoScreenBlendImpact,
  PhotoShadowPunchImpact,
  SolidCardDepthImpact,
  TriptychDepthImpact,
  TypeCollageDepthImpact,
  TypeDepthPanelImpact,
  TypeDepthRiseImpact,
  TypeDepthStackImpact,
  TypeDepthStampImpact,
  TypeDepthTiltImpact,
} from '@cut3/agent-memory/units/impact/ImpactRecipeUnits';
import { Image } from '@cut3/agent-memory/units/base/Image';
import { Text } from '@cut3/agent-memory/units/base/Text';

export function impactPhotoDepthZoom(source, text) {
  const unit = new PhotoDepthZoomImpact(photoUnits(source, 2), captionCopies(text, 1));
  const behaviours = unit.cadenceBindings.map(({ owner, role, params }) => (
    new ImpactCutCadence(owner, 'photo-depth-zoom', role, params)
  ));
  behaviours.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  return unit;
}

export function impactPhotoChromaDepth(source, text) {
  const unit = new PhotoChromaDepthImpact(photoUnits(source, 1), captionCopies(text, 1));
  const behaviours = unit.cadenceBindings.map(({ owner, role, params }) => (
    new ImpactCutCadence(owner, 'photo-chroma-depth', role, params)
  ));
  behaviours.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  return unit;
}

export function impactPhotoPunch2d(source, text) {
  const unit = new PhotoPunch2dImpact(photoUnits(source, 1), captionCopies(text, 1));
  const behaviours = unit.cadenceBindings.map(({ owner, role, params }) => (
    new ImpactCutCadence(owner, 'photo-punch-2d', role, params)
  ));
  behaviours.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  return unit;
}

export function impactPhotoScreenBlend(source, primary, secondary) {
  const unit = new PhotoScreenBlendImpact(
    photoUnits(source, 1),
    captionUnits([primary, secondary]),
  );
  const behaviours = unit.cadenceBindings.map(({ owner, role, params }) => (
    new ImpactCutCadence(owner, 'photo-screen-blend', role, params)
  ));
  behaviours.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  return unit;
}

export function impactTriptychDepth(source) {
  const unit = new TriptychDepthImpact(photoUnits(source, 3), []);
  const behaviours = unit.cadenceBindings.map(({ owner, role, params }) => (
    new ImpactCutCadence(owner, 'triptych-depth', role, params)
  ));
  behaviours.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  return unit;
}

export function impactPhotoShadowPunch(source) {
  const unit = new PhotoShadowPunchImpact(photoUnits(source, 1), []);
  const behaviours = unit.cadenceBindings.map(({ owner, role, params }) => (
    new ImpactCutCadence(owner, 'photo-shadow-punch', role, params)
  ));
  behaviours.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  return unit;
}

export function impactCollageDepthOutline(source, text) {
  const unit = new CollageDepthOutlineImpact(photoUnits(source, 3), captionCopies(text, 1));
  const behaviours = unit.cadenceBindings.map(({ owner, role, params }) => (
    new ImpactCutCadence(owner, 'collage-depth-outline', role, params)
  ));
  behaviours.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  return unit;
}

export function impactSolidCardDepth() {
  const unit = new SolidCardDepthImpact([], []);
  const behaviours = unit.cadenceBindings.map(({ owner, role, params }) => (
    new ImpactCutCadence(owner, 'solid-card-depth', role, params)
  ));
  behaviours.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  return unit;
}

export function impactTypeDepthRise(text) {
  const unit = new TypeDepthRiseImpact([], captionCopies(text, 20));
  const behaviours = unit.cadenceBindings.map(({ owner, role, params }) => (
    new ImpactCutCadence(owner, 'type-depth-rise', role, params)
  ));
  behaviours.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  return unit;
}

export function impactTypeDepthPanel(text) {
  const unit = new TypeDepthPanelImpact([], captionCopies(text, 30));
  const behaviours = unit.cadenceBindings.map(({ owner, role, params }) => (
    new ImpactCutCadence(owner, 'type-depth-panel', role, params)
  ));
  behaviours.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  return unit;
}

export function impactTypeDepthStack(text) {
  const unit = new TypeDepthStackImpact([], captionCopies(text, 20));
  const behaviours = unit.cadenceBindings.map(({ owner, role, params }) => (
    new ImpactCutCadence(owner, 'type-depth-stack', role, params)
  ));
  behaviours.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  return unit;
}

export function impactTypeDepthStamp(text) {
  const unit = new TypeDepthStampImpact([], captionCopies(text, 15));
  const behaviours = unit.cadenceBindings.map(({ owner, role, params }) => (
    new ImpactCutCadence(owner, 'type-depth-stamp', role, params)
  ));
  behaviours.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  return unit;
}

export function impactTypeDepthTilt(text) {
  const unit = new TypeDepthTiltImpact([], captionCopies(text, 25));
  const behaviours = unit.cadenceBindings.map(({ owner, role, params }) => (
    new ImpactCutCadence(owner, 'type-depth-tilt', role, params)
  ));
  behaviours.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  return unit;
}

export function impactTypeCollageDepth(primary, secondary) {
  const unit = new TypeCollageDepthImpact([], captionUnits([primary, secondary]));
  const behaviours = unit.cadenceBindings.map(({ owner, role, params }) => (
    new ImpactCutCadence(owner, 'type-collage-depth', role, params)
  ));
  behaviours.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  return unit;
}

function photoUnits(source, count) {
  return Array.from({ length: count }, () => new Image(source));
}

function captionCopies(text, count) {
  return Array.from({ length: count }, () => new Text(text));
}

function captionUnits(text) {
  return text.map((entry) => new Text(entry));
}

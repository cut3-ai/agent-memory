import { CutFlashEnvelope } from '@cut3/agent-memory/behaviours/media-montage/CutFlashEnvelope';
import { FlashCutMotion } from '@cut3/agent-memory/behaviours/media-montage/FlashCutMotion';
import { Video } from '@cut3/agent-memory/units/base/Video';
import { FlashCutSegment } from '@cut3/agent-memory/units/media-montage/FlashCutSegment';
import { FlashCutVideoMontage } from '@cut3/agent-memory/units/media-montage/FlashCutVideoMontage';
import { PremountedMediaShot } from '@cut3/agent-memory/units/media-montage/PremountedMediaShot';

/** Plain application output for runtime video slots and authored cut descriptors. */
export function flashCutVideoMontage(slots, fps) {
  const records = slots.map((slot, index) => {
    const from = Math.round((slot.startMilliseconds / 1000) * fps);
    const to = Math.round((slot.endMilliseconds / 1000) * fps);
    const video = new Video(slot.source, {
      muted: true,
      playbackRate: slot.playbackRate,
    });
    const segment = new FlashCutSegment(video);
    const shot = new PremountedMediaShot(segment, {
      duration: to - from,
      from,
      mediaBackend: 'video',
      name: `flash-cut-${index + 1}`,
      pauseWhenBuffering: false,
      premountFor: fps,
      reconciliationKey: `flash-cut-video-${index + 1}`,
    });
    return { duration: to - from, segment, shot, slot, video };
  });
  const unit = new FlashCutVideoMontage(records.map((record) => record.shot));
  const motions = records.map((record) => new FlashCutMotion(
    record.video,
    record.slot.easeMode,
    record.duration,
    record.slot.scaleFrom,
    record.slot.scaleTo,
  ));
  const flashes = records.map((record) => new CutFlashEnvelope(record.segment.flashPlate));

  records.forEach((record, index) => record.video.addBehaviour(motions[index]));
  records.forEach((record, index) => record.segment.flashPlate.addBehaviour(flashes[index]));

  return unit;
}

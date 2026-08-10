import { BlackStutterReveal } from '@cut3/agent-memory/behaviours/media-montage/BlackStutterReveal';
import { FirstClipGradeReveal } from '@cut3/agent-memory/behaviours/media-montage/FirstClipGradeReveal';
import { VignetteRelease } from '@cut3/agent-memory/behaviours/media-montage/VignetteRelease';
import { Video } from '@cut3/agent-memory/units/base/Video';
import { PremountedMediaShot } from '@cut3/agent-memory/units/media-montage/PremountedMediaShot';
import { SourceOffsetVideoMontage } from '@cut3/agent-memory/units/media-montage/SourceOffsetVideoMontage';
import { VignetteRevealClip } from '@cut3/agent-memory/units/media-montage/VignetteRevealClip';

/** Plain application output for runtime sources, offsets, cut endpoints and volumes. */
export function sourceOffsetVideoMontage(segments, fps, entranceMilliseconds = 880) {
  const first = segments[0];
  const firstEnd = Math.round((first.endMilliseconds / 1000) * fps);
  const firstOffset = Math.round((first.sourceOffsetMilliseconds / 1000) * fps);
  const entranceFrames = Math.max(1, Math.round((entranceMilliseconds / 1000) * fps));
  const firstVideo = new Video(first.source, {
    muted: false,
    startFrom: firstOffset,
    volume: first.volume,
  });
  const firstClip = new VignetteRevealClip(firstVideo);
  const firstShot = new PremountedMediaShot(firstClip, {
    duration: firstEnd,
    from: 0,
    mediaBackend: 'offthread-video',
    name: 'source-offset-cut-1',
    pauseWhenBuffering: true,
    premountFor: fps,
    reconciliationKey: 'source-offset-video-1',
  });
  const tail = segments.slice(1).map((segment, index) => {
    const from = Math.round((segments[index].endMilliseconds / 1000) * fps);
    const to = Math.round((segment.endMilliseconds / 1000) * fps);
    const startFrom = Math.round((segment.sourceOffsetMilliseconds / 1000) * fps);
    const video = new Video(segment.source, {
      muted: false,
      startFrom,
      volume: segment.volume,
    });
    const shot = new PremountedMediaShot(video, {
      duration: to - from,
      from,
      mediaBackend: 'offthread-video',
      name: `source-offset-cut-${index + 2}`,
      pauseWhenBuffering: true,
      premountFor: fps,
      reconciliationKey: `source-offset-video-${index + 2}`,
    });
    return { shot, video };
  });
  const unit = new SourceOffsetVideoMontage([
    firstShot,
    ...tail.map((record) => record.shot),
  ]);
  const grade = new FirstClipGradeReveal(firstVideo, entranceFrames);
  const release = new VignetteRelease(firstClip.vignette, entranceFrames);
  const stutter = new BlackStutterReveal(firstClip.blackStutter, entranceFrames);

  firstVideo.addBehaviour(grade);
  firstClip.vignette.addBehaviour(release);
  firstClip.blackStutter.addBehaviour(stutter);

  return unit;
}

import { Video } from '@cut3/agent-memory/units/base/Video';
import { PremountedMediaShot } from '@cut3/agent-memory/units/media-montage/PremountedMediaShot';

/** Infrastructure-only handoff for one runtime OffthreadVideo candidate. */
export function offthreadVideoCandidate(source, duration, fps) {
  const video = new Video(source, {
    muted: true,
    playbackRate: 1.5,
  });
  const shot = new PremountedMediaShot(video, {
    duration,
    from: 0,
    mediaBackend: 'offthread-video',
    name: 'offthread-video-candidate',
    pauseWhenBuffering: false,
    premountFor: fps,
    reconciliationKey: 'offthread-video-candidate-1',
  });

  return shot;
}

// Temporary no-op guard against a retired experiment process still running in
// another editor session. The active profile lab owns refinement runs.
process.stdout.write('{"retired":true}\n');

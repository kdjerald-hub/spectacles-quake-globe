"""Writes the alert chime used by the Lens: two soft bell tones, E5 then A5, about 1.1 s.

Generated from code, so it has no licence strings attached (the project's own work).

    python3 tools/make_chime.py lens/Assets/QuakeGlobe/Audio/alert_chime.wav
"""

import math
import struct
import sys
import wave

RATE = 44100
LENGTH_S = 1.1
PEAK = 0.7  # about -3 dBFS, loud enough to notice, short of harsh
# (start s, frequency Hz): a rising fourth reads as "attention", not "danger"
NOTES = [(0.0, 659.25), (0.18, 880.0)]
# Bell-like partials: (frequency ratio, amplitude, decay time constant s)
PARTIALS = [(1.0, 1.0, 0.38), (2.0, 0.28, 0.22), (3.0, 0.08, 0.12)]
ATTACK_S = 0.006
FADE_S = 0.08


def sample(t):
    v = 0.0
    for start, f in NOTES:
        dt = t - start
        if dt < 0:
            continue
        attack = min(1.0, dt / ATTACK_S)
        for ratio, amp, tau in PARTIALS:
            v += attack * amp * math.exp(-dt / tau) * math.sin(2 * math.pi * f * ratio * dt)
    tail = LENGTH_S - t
    if tail < FADE_S:
        v *= max(0.0, tail / FADE_S)
    return v


def main():
    out = sys.argv[1]
    n = int(RATE * LENGTH_S)
    raw = [sample(i / RATE) for i in range(n)]
    scale = PEAK / max(abs(x) for x in raw)
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", int(round(x * scale * 32767))) for x in raw))
    print("wrote %s: %d samples, %.2f s, peak %.2f" % (out, n, n / RATE, PEAK))


if __name__ == "__main__":
    main()

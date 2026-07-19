---
id: doc-53
title: Reset runaway Herdr notification volume on PipeWire
type: guide
created_date: '2026-07-19 03:34'
updated_date: '2026-07-19 03:34'
tags:
  - solution
  - herdr
  - audio
  - pipewire
  - linux
---
# Reset runaway Herdr notification volume on PipeWire

## Symptom

Every Herdr notification is dramatically louder than ordinary application audio even though the default output sink is at a moderate level.

## Root cause

On Linux, Herdr 0.7.4 and current upstream try `paplay` first and invoke it without a volume or dedicated application identity. WirePlumber restores output-stream volume by `application.name`, so every Herdr notification inherits the generic `paplay` history. A persisted `paplay` channel volume of `8.0` appears live as `200% / +18.06 dB`; that gain is reapplied to every fresh notification. A silent probe and loudness analysis distinguish this from corrupt or over-normalized bundled sound assets.

## Resolution

Reset the generic `paplay` stream through the audio APIs rather than editing WirePlumber state or changing the master sink. Start a several-second silent stream through `paplay` with a unique stream name, locate only that sink input, run `pactl set-sink-input-volume <index> 100%`, and let the stream finish so WirePlumber persists unity gain. This preserves notification delivery and removes the amplification. A product-level repair should give Herdr a dedicated application identity so it cannot inherit unrelated generic `paplay` mixer history.

## Verification

Before reset, a silent `paplay` stream reproduced `200% / +18.06 dB`. After setting that sink input to unity, WirePlumber recorded `channelVolumes=1.0;1.0`. A second new silent process using the same `sink-input-by-application-name:paplay` restore identity opened at `100%`, proving the repair survived process replacement without playing an audible alert.

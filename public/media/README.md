# Show-start media

The user supplied “Consolidated Theatres Hula Trailer — 100th Anniversary
Remaster”, credited in its supplied filename to Consolidated Theatres Hawaii,
for use as the theater's opening cue.

`hula-start.mp4` is the complete 82.04-second supplied trailer, transcoded from
1920×1038 to 960×520, H.264 Main / yuv420p, AAC stereo, with MP4 fast-start
metadata. `hula-start.m4a` contains the same AAC soundtrack for the game's Web
Audio spatial playback. The original user file is unmodified. Playback uses
normal real-time speed and letterboxing, independently of the 2× shift clock.

FFmpeg 7.1 (imageio-ffmpeg 0.6.0 distribution) was used with `scale=960:-2`,
`libx264 -preset slow -crf 26 -profile:v main -pix_fmt yuv420p`,
`aac -b:a 96k -movflags +faststart`. The audio-only copy uses `-vn -c:a copy`.

This user-provided third-party media is separate from the original geometry
and fictional poster artwork authored for this project.

# Feature program: Big Buck Bunny

Copyright 2008, Blender Foundation / https://www.bigbuckbunny.org/.
Licensed under [Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/).
Official [license and attribution](https://peach.blender.org/about/) and
[download page](https://peach.blender.org/download/).
Source: https://download.blender.org/peach/bigbuckbunny_movies/big_buck_bunny_480p_h264.mov.zip

The complete 596.46-second film, including its full ending credits, is included.
Changes: re-encoded at 854×480, 24 fps, H.264 Main, stereo AAC 64 kbps for browser
playback. The film loops during fictional simulator showtimes after the opening
trailer. Screen playback is enabled near the player to bound decoder/GPU cost.
This film is licensed separately from the game's original code and assets.

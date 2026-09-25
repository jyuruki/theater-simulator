# Show-start media

The user supplied “Consolidated Theatres Hula Trailer — 100th Anniversary
Remaster”, credited in its supplied filename to Consolidated Theatres Hawaii,
for use as the theater's opening cue.

`hula-start.mp4` is the complete 82.04-second supplied trailer, transcoded from
1920×1038 to 960×520, H.264 Main / yuv420p, AAC stereo, with MP4 fast-start
metadata. `hula-start.m4a` contains the same AAC soundtrack for the game's Web
Audio spatial playback. The original user file is unmodified. Playback uses
normal real-time speed and letterboxing, independently of the selected shift speed.

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
Changes: re-encoded at 854×480, 24 fps, H.264 Main, stereo AAC 48–64 kbps for browser
playback. The film loops during fictional simulator showtimes after the opening
trailer. Screen playback is enabled near the player to bound decoder/GPU cost.
This film is licensed separately from the game's original code and assets.

# Additional feature program (v0.25)

These complete films retain their original picture, sound and ending credits.
The only changes are browser delivery transcodes: H.264 Main / yuv420p, 24 fps,
stereo AAC 64 kbps, fast-start metadata. None is represented as public domain.
They rotate by auditorium and showing, after the supplied Hula opening.

| File | Credit | License | Source and changes |
| --- | --- | --- | --- |
| `sintel.mp4` | © 2010 Blender Foundation · www.sintel.org | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | [Official sharing terms](https://durian.blender.org/sharing/), [official source](https://download.blender.org/demo/movies/Sintel.2010.720p.mkv.zip). Complete 888.03 s film, transcoded to 640×272. |
| `tears-of-steel.mp4` | © 2012 Blender Foundation · mango.blender.org | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | [Official sharing terms](https://mango.blender.org/sharing/), [official source](https://download.blender.org/demo/movies/ToS/tears_of_steel_720p.mov). Complete 734.17 s film, transcoded to 640×268. |
| `caminandes-gran-dillama.mp4` | © 2013 Blender Institute · Caminandes: Gran Dillama · directed by Pablo Vazquez, produced by Francesco Siddi | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | [License record](https://commons.wikimedia.org/wiki/File:Caminandes,_Gran_Dillama_-_Blender_Foundation.webm), [official source](https://download.blender.org/demo/movies/caminandes_gran_dillama.mp4.zip). Complete 146.05 s film, transcoded to 854×480. This transcode is distributed under the same CC BY-SA 3.0 license. |

The embedded soundtracks remain part of their complete films, not separately
redistributed soundtrack albums. The filmmakers do not endorse this simulator.
The four feature downloads total 88,082,117 bytes. They stream only as needed;
the pause screen offers optional offline saving. Two combined feature/trailer
video decoders may run near the player; distant shows retain logical clocks.

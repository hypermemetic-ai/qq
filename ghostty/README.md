# Ghostty surface

`config` keeps the Herdr terminal fullscreen on the 3840×2160 TV with the readable 24-point MxPlus grid and only a small 12-point edge. It forces the exact window title `herdr`, which Handy uses to select bridge insertion rather than legacy synthetic typing.

Launch future cockpit clients with `qq-herdr-launch`. It pins that title on the command line too and removes inherited `HERDR_*` pane context before connecting. Changing these files does not require disturbing the current client; Ghostty will use them on the next launch.

It deliberately retires two earlier cockpit customizations:

- the 4K profile's 480-point horizontal padding, which reduced the fullscreen terminal to a centered 160×67-cell square field;
- the `column-rails.glsl` shader, which painted a black strip over Herdr's old right-side edge.

The centered preferred-width pane canvas now belongs to the Herdr downstream patch; Ghostty should expose the full display rather than simulating outer margins or masking UI pixels.

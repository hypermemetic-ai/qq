# Ghostty surface

`config` keeps the Herdr terminal fullscreen on the 3840×2160 TV with the readable 24-point MxPlus grid and only a small 12-point edge.

It deliberately retires two earlier cockpit customizations:

- the 4K profile's 480-point horizontal padding, which reduced the fullscreen terminal to a centered 160×67-cell square field;
- the `column-rails.glsl` shader, which painted a black strip over Herdr's old right-side edge.

The centered preferred-width pane canvas now belongs to the Herdr downstream patch; Ghostty should expose the full display rather than simulating outer margins or masking UI pixels.

// Herdr surface normalization for Ghostty.
// The current mode draws no decorative outer rails; it only neutralizes
// Herdr's inconsistent session-only right edge across all terminal surfaces.

// Coordinates are authored for 3840px output and scale with the display mode.
//
// KNOWN-GOOD PRESET — "Herdr inset":
//   reference_left_edge  = 628.5;  // pixels 627-629
//   reference_right_edge = 3171.5; // pixels 3170-3172
// This repeats Herdr's native 10px gap at both ends of its content.
//
// SAVED ALTERNATE — "Ghostty boundary":
// Place the rails at Ghostty's mirrored 480px padding boundaries, giving the
// application a deliberately wide outer field.
const float reference_width = 3840.0;
const float reference_left_edge = 480.5;
const float reference_right_edge = 3359.5;
const float reference_rail_width = 3.0;
// CURRENT — "No bars":
// Preserve only the mask for Herdr's inconsistent session-only right edge.
const bool draw_rails = false;
// Herdr's session-only right rule is 3px at rest and 9px on hover.
const float reference_session_edge = 3179.5;
const float reference_session_edge_width = 9.0;
// Match Herdr's spaces/agents separator: terminal #808080.
// Keeping its 3px width preserves the display's exact 3x pixel grid, while
// the lower luminance avoids the optical thickening of the former #cccccc.
const vec3 rail_color = vec3(0.21586);
// Linear-light equivalent of terminal #010101.
const vec3 background_color = vec3(0.0003035);

void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    vec4 color = texture(iChannel0, fragCoord.xy / iResolution.xy);
    float output_scale = iResolution.x / reference_width;
    float left_edge = reference_left_edge * output_scale;
    float right_edge = reference_right_edge * output_scale;
    float rail_width = max(1.0, reference_rail_width * output_scale);
    float session_edge = reference_session_edge * output_scale;
    float session_edge_width = max(1.0, reference_session_edge_width * output_scale);
    bool on_left = abs(fragCoord.x - left_edge) < rail_width * 0.5;
    bool on_right = abs(fragCoord.x - right_edge) < rail_width * 0.5;
    bool on_session_edge =
        abs(fragCoord.x - session_edge) < session_edge_width * 0.5;

    if (on_session_edge) {
        color = vec4(background_color, 1.0);
    } else if (draw_rails && (on_left || on_right)) {
        color = vec4(rail_color, 1.0);
    }

    fragColor = color;
}

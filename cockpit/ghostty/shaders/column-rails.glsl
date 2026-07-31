// Herdr surface normalization for Ghostty.
// On the exact 4K reference surface it neutralizes Herdr's inconsistent
// session-only right edge. Other window and display sizes pass through
// unchanged. Coordinates are authored for 3840px fullscreen output.

const float reference_width = 3840.0;
// Herdr's session-only right rule is 3px at rest and 9px on hover.
const float reference_session_edge = 3179.5;
const float reference_session_edge_width = 9.0;
// Linear-light equivalent of terminal #010101.
const vec3 background_color = vec3(0.0003035);

void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    vec4 color = texture(iChannel0, fragCoord.xy / iResolution.xy);
    bool reference_layout = abs(iResolution.x - reference_width) < 0.5;
    float output_scale = iResolution.x / reference_width;
    float session_edge = reference_session_edge * output_scale;
    float session_edge_width = max(1.0, reference_session_edge_width * output_scale);

    if (reference_layout && abs(fragCoord.x - session_edge) < session_edge_width * 0.5) {
        color = vec4(background_color, 1.0);
    }

    fragColor = color;
}

// Gray-Scott Reaction-Diffusion — Image pass
// Reads Buffer A output (iChannel0) and applies color mapping

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec4 c = texture(iChannel0, uv);
    float b = c.g;

    // Color palette
    vec3 c1 = vec3(0.05, 0.02, 0.15);  // deep purple (background)
    vec3 c2 = vec3(0.9, 0.3, 0.05);    // orange (pattern edge)
    vec3 c3 = vec3(1.0, 0.95, 0.8);    // warm white (pattern core)

    vec3 col = mix(c1, c2, smoothstep(0.0, 0.3, b));
    col = mix(col, c3, smoothstep(0.3, 0.6, b));

    fragColor = vec4(col, 1.0);
}

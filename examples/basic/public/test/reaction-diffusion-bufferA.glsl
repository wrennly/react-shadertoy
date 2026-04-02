// Gray-Scott Reaction-Diffusion — Buffer A
// Self-referencing: reads iChannel0 (= own previous frame)

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec2 px = 1.0 / iResolution.xy;

    vec4 c = texture(iChannel0, uv);
    float a = c.r;
    float b = c.g;

    // Initialize
    if (iFrame < 10) {
        a = 1.0;
        b = 0.0;
        // Seed center blob
        if (length(uv - 0.5) < 0.03) b = 1.0;
        // Scattered seeds
        float rnd = fract(sin(dot(fragCoord, vec2(12.9898, 78.233))) * 43758.5453);
        if (rnd > 0.998) b = 1.0;
        // Mouse seed
        if (iMouse.z > 0.0) {
            if (length(fragCoord - iMouse.xy) < 10.0) b = 1.0;
        }
    }

    // Mouse interaction (ongoing)
    if (iMouse.z > 0.0 && iFrame >= 10) {
        if (length(fragCoord - iMouse.xy) < 10.0) b = 1.0;
    }

    // 3x3 Laplacian kernel
    float la = -a, lb = -b;
    for (int dy = -1; dy <= 1; dy++) {
        for (int dx = -1; dx <= 1; dx++) {
            if (dx == 0 && dy == 0) continue;
            vec2 off = vec2(float(dx), float(dy)) * px;
            vec4 s = texture(iChannel0, uv + off);
            float w = (dx == 0 || dy == 0) ? 0.2 : 0.05;
            la += w * s.r;
            lb += w * s.g;
        }
    }

    // Gray-Scott parameters (coral pattern)
    float f = 0.0545, k = 0.062;
    float abb = a * b * b;
    a += (1.0 * la - abb + f * (1.0 - a));
    b += (0.5 * lb + abb - (k + f) * b);

    fragColor = vec4(clamp(a, 0.0, 1.0), clamp(b, 0.0, 1.0), 0.0, 1.0);
}

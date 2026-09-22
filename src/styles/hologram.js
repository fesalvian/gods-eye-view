/**
 * Hologram Style — Cyan/Blue Wireframe Holographic Projection
 * Sobel edge-detected wireframe glow over a dim cyan base, fine screen-space
 * grid, a slow vertical sweep band, subtle CRT-style scanlines and light
 * flicker — the "Iron Man workshop projection" look. Reads the scene depth
 * buffer (czm_readDepth, a Cesium builtin — automatically bound whenever a
 * PostProcessStage shader declares `uniform sampler2D depthTexture`, no
 * extra JS-side wiring needed) to force empty space to pure black instead of
 * letting the grid/sweep/edge treatment light up the starfield — otherwise
 * the effect reads as noisy clutter behind the globe instead of a clean
 * hologram (fixed after real-usage feedback).
 *
 * Exposed uniforms:
 *   gridScale (8-128)  — grid cell size in screen pixels (smaller = denser grid)
 *   scanSpeed (0-3)     — vertical sweep band speed
 *   flicker (0-1)       — holographic instability/flicker amount
 *   edgeGlow (0-3)      — wireframe edge brightness
 */
export const hologramShader = {
  name: 'hologram',
  uniforms: {
    gridScale: { default: 48, min: 8, max: 128, label: 'Grid' },
    scanSpeed: { default: 1.0, min: 0, max: 3, label: 'Sweep speed' },
    flicker: { default: 0.5, min: 0, max: 1, label: 'Flicker' },
    edgeGlow: { default: 1.4, min: 0, max: 3, label: 'Edge glow' },
  },
  fragmentShader: /* glsl */ `
    uniform sampler2D colorTexture;
    uniform vec2 colorTextureDimensions;
    uniform sampler2D depthTexture;
    uniform float intensity;
    uniform float time;
    uniform float gridScale;
    uniform float scanSpeed;
    uniform float flicker;
    uniform float edgeGlow;
    in vec2 v_textureCoordinates;

    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

    void main() {
      vec2 uv = v_textureCoordinates;
      vec2 texel = 1.0 / colorTextureDimensions;
      vec4 original = texture(colorTexture, uv);

      // ── Empty space (nothing rendered — depth at the far plane): force
      //    pure black, skip the wireframe/grid/sweep treatment entirely so
      //    stars/atmosphere haze never turn into hologram clutter. ──
      float sceneDepth = czm_readDepth(depthTexture, uv);
      if (sceneDepth >= 0.9999) {
        out_FragColor = vec4(mix(original.rgb, vec3(0.0), intensity), original.a);
        return;
      }

      // ── Sobel edge detection — drives the wireframe glow ──────
      float tl = luma(texture(colorTexture, uv + texel * vec2(-1.0, -1.0)).rgb);
      float t  = luma(texture(colorTexture, uv + texel * vec2( 0.0, -1.0)).rgb);
      float tr = luma(texture(colorTexture, uv + texel * vec2( 1.0, -1.0)).rgb);
      float l  = luma(texture(colorTexture, uv + texel * vec2(-1.0,  0.0)).rgb);
      float r  = luma(texture(colorTexture, uv + texel * vec2( 1.0,  0.0)).rgb);
      float bl = luma(texture(colorTexture, uv + texel * vec2(-1.0,  1.0)).rgb);
      float b  = luma(texture(colorTexture, uv + texel * vec2( 0.0,  1.0)).rgb);
      float br = luma(texture(colorTexture, uv + texel * vec2( 1.0,  1.0)).rgb);
      float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
      float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
      float edge = clamp(sqrt(gx * gx + gy * gy), 0.0, 1.0);

      // ── Dim cyan base (holographic projections read dark, not lit) ──
      float lum = luma(original.rgb);
      vec3 cyanBase = vec3(0.08, 0.55, 0.85) * lum * 0.5;

      // ── Wireframe glow along detected edges ────────────────────
      vec3 wireColor = vec3(0.35, 0.95, 1.0);
      vec3 wire = wireColor * pow(edge, 0.6) * edgeGlow;

      // ── Fine screen-space projection grid ──────────────────────
      vec2 gridUV = uv * colorTextureDimensions / max(gridScale, 1.0);
      float gx2 = smoothstep(0.965, 1.0, fract(gridUV.x)) + smoothstep(0.035, 0.0, fract(gridUV.x));
      float gy2 = smoothstep(0.965, 1.0, fract(gridUV.y)) + smoothstep(0.035, 0.0, fract(gridUV.y));
      vec3 grid = wireColor * clamp(gx2 + gy2, 0.0, 1.0) * 0.10;

      // ── Slow vertical sweep band (projector scan) ──────────────
      float sweepPos = fract(time * scanSpeed * 0.08);
      float sweep = smoothstep(0.10, 0.0, abs(uv.y - sweepPos));
      vec3 sweepGlow = wireColor * sweep * 0.30;

      // ── Fine horizontal scanlines ───────────────────────────────
      float scan = pow(sin(uv.y * colorTextureDimensions.y * 1.5) * 0.5 + 0.5, 3.0) * 0.08;

      // ── Holographic flicker/instability ─────────────────────────
      float flickerNoise = fract(sin(time * 37.1) * 4321.9);
      float flick = 1.0 - flicker * 0.08 * step(0.95, flickerNoise);

      vec3 result = (cyanBase + wire + grid + sweepGlow) * flick;
      result -= vec3(scan);
      result = clamp(result, 0.0, 1.0);

      out_FragColor = vec4(mix(original.rgb, result, intensity), original.a);
    }
  `,
};

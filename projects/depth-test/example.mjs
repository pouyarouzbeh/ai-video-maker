import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {writeFile} from "node:fs/promises";
import {chromium} from "playwright";

const installedChrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const executablePath = process.env.REEL_CHROME || (existsSync(installedChrome) ? installedChrome : undefined);
const browser = await chromium.launch({executablePath, args: ["--enable-unsafe-swiftshader"]});
try {
  const page = await browser.newPage();
  const runs = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 8;
    const gl = canvas.getContext("webgl", {antialias: false, depth: true});
    if (!gl || !gl.getContextAttributes().depth) throw new Error("WebGL depth buffer unavailable");

    function shader(type, source) {
      const compiled = gl.createShader(type);
      gl.shaderSource(compiled, source);
      gl.compileShader(compiled);
      if (!gl.getShaderParameter(compiled, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(compiled));
      return compiled;
    }

    const program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, `
      attribute vec2 point;
      uniform float depth;
      void main() { gl_Position = vec4(point, depth * 2.0 - 1.0, 1.0); }
    `));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, `
      precision mediump float;
      uniform vec3 marker;
      void main() { gl_FragColor = vec4(marker, 1.0); }
    `));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const positions = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positions);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const point = gl.getAttribLocation(program, "point");
    gl.vertexAttribPointer(point, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(point);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.depthFunc(gl.LESS);
    gl.clearDepth(1);
    gl.clearColor(0, 0, 0, 1);
    const depthUniform = gl.getUniformLocation(program, "depth");
    const markerUniform = gl.getUniformLocation(program, "marker");
    const depths = {near: 0.25, far: 0.75};

    return [["near", "far"], ["far", "near"]].map((order) => {
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const steps = order.map((input) => {
        gl.uniform1f(depthUniform, depths[input]);
        gl.uniform3f(markerUniform, input === "near" ? 1 : 0, input === "far" ? 1 : 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        const pixel = new Uint8Array(4);
        gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        const visible = pixel[0] === 255 ? "near" : pixel[1] === 255 ? "far" : "none";
        // Each draw uses a unique color and a known constant depth, so the
        // visible pixel identifies which depth survived the test.
        return {input, inputDepth: depths[input], passed: visible === input,
          visible, storedDepth: depths[visible] ?? 1};
      });
      if (gl.getError() !== gl.NO_ERROR) throw new Error("WebGL draw/readback failed");
      return {order, clearDepth: 1, steps};
    });
  });
  assert.deepEqual(runs.map(({steps}) => steps.map(({visible}) => visible)), [["near", "near"], ["far", "near"]]);
  const result = JSON.stringify({api: "WebGL 1", rule: "GL_LESS", depthWrites: true, runs}, null, 2) + "\n";
  if (process.argv.includes("--write")) await writeFile(new URL("depth-trace.json", import.meta.url), result);
  console.log(result);
} finally {
  await browser.close();
}

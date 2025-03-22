import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  Mesh,
  Color,
  DirectionalLight,
  AmbientLight,
  PlaneGeometry,
  VideoTexture,
  AxesHelper,
  GridHelper,
  AudioListener,
  DoubleSide,
  Vector2,
  ShaderMaterial,
  Audio,
  AudioAnalyser,
  SRGBColorSpace,
} from "three";

var w,
  h,
  scene,
  camera,
  renderer,
  fftVisualContainer,
  albumSelector,
  controls,
  video,
  analyser,
  bars,
  albums,
  videoAspectRatio,
  listener,
  videoContainer,
  sound;
var band = "jyocho";
var state = "initial";
var fftSize = 1024;
var videoWidth = 4;
var barWidth = videoWidth / fftSize;
var barCount = fftSize / 2;
var duration = 1;

var barShaderMaterial = new ShaderMaterial({
  uniforms: {
    videoTexture: { value: null },
    clipStart: { value: new Vector2(0.5, 0.5) },
    clipEnd: { value: new Vector2(1.0, 1.0) },
  },
  vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
  fragmentShader: `
      uniform sampler2D videoTexture;
      uniform vec2 clipStart;
      uniform vec2 clipEnd;
      varying vec2 vUv;

      void main() {
        vec2 adjustedUV = clipStart + vUv * (clipEnd - clipStart);

        if(adjustedUV.x < clipStart.x || adjustedUV.x > clipEnd.x ||
           adjustedUV.y < clipStart.y || adjustedUV.y > clipEnd.y) {
          discard;
        }

        gl_FragColor = texture2D(videoTexture, adjustedUV);
      }
    `,
  side: DoubleSide,
});

function setupScene() {
  w = fftVisualContainer.clientWidth;
  h = fftVisualContainer.clientHeight;
  scene = new Scene();
  camera = new PerspectiveCamera(75, w / h, 0.1, 1000);
  renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.localClippingEnabled = true;
  fftVisualContainer.append(renderer.domElement);
  renderer.setSize(w, h);

  scene.add(new GridHelper(3, 10));
  // scene.add(new AxesHelper());

  controls = new OrbitControls(camera, renderer.domElement);
  controls.update();

  // controls.addEventListener("change", () => {
  //   console.log(
  //     "Camera position:",
  //     `new THREE.Vector3(${camera.position.x}, ${camera.position.y}, ${camera.position.z})`
  //   );

  //   console.log(
  //     "Camera rotation:",
  //     `new THREE.Euler(${camera.rotation.x}, ${camera.rotation.y}, ${camera.rotation.z})`
  //   );

  //   console.log(
  //     "Controls target:",
  //     `new THREE.Vector3(${controls.target.x}, ${controls.target.y}, ${controls.target.z})`
  //   );
  // });

  camera.position.set(-1.19430954837099, 0.4045458125871111, 1.7464505055067852);
  controls.target.set(-0.35377310000253687, -0.10430305988715591, -0.5160735385203125);

  listener = new AudioListener();
  camera.add(listener);

  sound = new Audio(listener);
  analyser = new AudioAnalyser(sound, fftSize);

  renderer.setAnimationLoop(() => {
    if (state === "playing") {
      analyser.getFrequencyData();

      for (let i = 0; i < fftSize / 2; i++) {
        const heightPercent = Math.max(0, analyser.data[i] / 255);

        bars[i].scale.y = heightPercent;
        bars[i].material.uniforms.clipStart.value.set(i / barCount, 0.5 - heightPercent / 2);
        bars[i].material.uniforms.clipEnd.value.set((i + 1) / barCount, 0.5 + heightPercent / 2);
      }

      document.body.style.background = `rgba(0,0,0,${Math.min(0.6, 0.5 + analyser.getAverageFrequency() / fftSize)})`;
    }

    if (state === "fadeout") {
      for (let i = 0; i < fftSize / 2; i++) {
        bars[i].scale.y = Math.max(bars[i].scale.y - 0.01, 0);
        bars[i].material.uniforms.clipStart.value.set(i / barCount, 0.5 - bars[i].scale.y / 2);
        bars[i].material.uniforms.clipEnd.value.set((i + 1) / barCount, 0.5 + bars[i].scale.y / 2);
      }
      sound.setVolume(Math.max(0, sound.getVolume() - 0.01));
    }

    controls.update();
    renderer.render(scene, camera);
  });

  window.addEventListener("resize", resize);
}

document.addEventListener("DOMContentLoaded", () => {
  fftVisualContainer = document.querySelector(".fft-visual");
  albumSelector = document.querySelector(".album-selector");
  videoContainer = document.querySelector(".video-container");
  albums = Array.from({ length: 4 }, (_, i) => i);

  albumSelector.insertAdjacentHTML(
    "afterbegin",
    albums
      .map(
        (x, i) => `
          <div class="album id-${i}">
            <img src="./${band}/${i}/album.png" />
          </div> 
        `
      )
      .join("")
  );

  albums = albums.map((_, i) => document.querySelector(`.album.id-${i}`));

  albums.forEach((album, i) => {
    album.onclick = () => {
      albumClick(i);
    };
  });

  setupScene();
});

function albumClick(albumIdx) {
  if (state === "fadeout") {
    return;
  }

  albums.forEach((a) => {
    a.classList.remove("active");
  });

  albums[albumIdx].classList.toggle("active");

  if (state === "playing") {
    setState("fadeout");

    setTimeout(() => {
      replaceVideo(albumIdx);
    }, 1000);
  }

  if (state === "initial") {
    replaceVideo(albumIdx);
  }
}

function replaceVideo(albumIdx) {
  if (video) {
    video.remove();
  }

  if (sound) {
    sound.disconnect();

    if (analyser) {
      analyser.analyser.disconnect();
    }
  }

  sound = new Audio(listener);
  analyser = new AudioAnalyser(sound, fftSize);

  if (bars) {
    bars.forEach((bar) => {
      if (bar.material.uniforms.value) {
        bar.material.uniforms.value.dispose();
      }

      scene.remove(bar);
    });
  }

  video = document.createElement("video");
  video.style["object-fit"] = "cover";
  video.src = `./${band}/${albumIdx}/vid.mp4`;
  video.crossOrigin = "anonymous";
  video.loop = true;

  video.oncanplay = () => {
    videoAspectRatio = video.videoWidth / video.videoHeight;
    duration = video.duration;
    videoContainer.append(video);

    const videoTexture = new VideoTexture(video);
    videoTexture.colorSpace = SRGBColorSpace;

    bars = Array.from({ length: fftSize / 2 }, (_, i) => {
      const bar = new Mesh(new PlaneGeometry(barWidth, videoWidth / videoAspectRatio), barShaderMaterial.clone());

      bar.material.uniforms.videoTexture.value = videoTexture;

      scene.add(bar);
      bar.scale.y = 0.01;
      bar.position.set((i - fftSize / 2 / 2 + 0.5) * barWidth, 0, 0);

      return bar;
    });

    video.play();
    sound.setNodeSource(listener.context.createMediaElementSource(video));
    sound.setVolume(0.2);

    setTimeout(() => {
      setState("playing");
    }, 100);
  };
}

function resize() {
  w = fftVisualContainer.clientWidth;
  h = fftVisualContainer.clientHeight;

  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function setState(newState) {
  document.body.classList.remove(state);
  state = newState;
  document.body.classList.toggle(newState, true);
}

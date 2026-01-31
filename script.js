
        let camera, scene, renderer;
        let video, texture, material, mesh;
        let stream;
        let facingMode = 'environment';
        let wrapper;

        const vertexShader = `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;

        const fragmentShader = `
            uniform sampler2D tDiffuse;
            uniform float curvature;
            uniform float zoom;
            uniform float aspectRatio;
            varying vec2 vUv;

            void main() {
                vec2 p = vUv - 0.5;
                vec2 p_aspect = p;
                p_aspect.x *= aspectRatio;

                float r = length(p_aspect);
                
                // 렌즈 크기 조정 (화면이 작아졌으므로 꽉 차게 보이도록 0.45 -> 가변적으로 조정 가능하나 일단 유지)
                // 모바일 레이아웃에서는 캔버스 영역 자체가 작을 수 있으므로 
                // 반지름을 조금 더 키워서(0.48) 여백을 줄임
                float radius = 0.48; 
                
                if (r > radius) {
                    if (r < radius + 0.015) {
                        gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0); // White Rim
                    } else {
                        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); // Black Background
                    }
                    return;
                }

                float rn = r / radius;
                float distortion = 1.0 + curvature * (pow(rn, 2.0) * 2.0);
                
                vec2 uv_distorted = p / (distortion * zoom);
                vec2 uv_final = uv_distorted + 0.5;

                vec3 color = vec3(0.0);
                
                if (uv_final.x < 0.0 || uv_final.x > 1.0 || uv_final.y < 0.0 || uv_final.y > 1.0) {
                     color = vec3(0.0);
                } else {
                     color = texture2D(tDiffuse, uv_final).rgb;
                }

                vec2 lightPos = vec2(-0.15, 0.15);
                float gloss = 1.0 - smoothstep(0.0, 0.25, length(p_aspect - lightPos));
                color += vec3(1.0) * gloss * 0.15 * curvature;

                float vignette = smoothstep(0.8, 1.0, rn);
                color = mix(color, color * 0.5, vignette);

                gl_FragColor = vec4(color, 1.0);
            }
        `;

        init();

        function init() {
            wrapper = document.getElementById('canvas-wrapper');
            scene = new THREE.Scene();

            // 부모 컨테이너의 크기를 가져옴
            const width = wrapper.clientWidth;
            const height = wrapper.clientHeight;

            camera = new THREE.OrthographicCamera(width / -2, width / 2, height / 2, height / -2, 1, 1000);
            camera.position.z = 1;

            renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true }); // Alpha true for transparency if needed
            renderer.setSize(width, height);
            renderer.setPixelRatio(window.devicePixelRatio);
            wrapper.appendChild(renderer.domElement);

            video = document.getElementById('video');
            startCamera();

            texture = new THREE.VideoTexture(video);
            texture.minFilter = THREE.LinearFilter;
            
            const geometry = new THREE.PlaneGeometry(width, height); // 초기 지오메트리
            
            material = new THREE.ShaderMaterial({
                uniforms: {
                    tDiffuse: { value: texture },
                    curvature: { value: 0.5 },
                    zoom: { value: 1.0 },
                    aspectRatio: { value: width / height }
                },
                vertexShader: vertexShader,
                fragmentShader: fragmentShader
            });

            mesh = new THREE.Mesh(geometry, material);
            scene.add(mesh);

            // window resize 이벤트 리스너 수정
            window.addEventListener('resize', onWindowResize, false);
            
            // Slider Event Listeners
            const curvatureInput = document.getElementById('curvature');
            const curvatureVal = document.getElementById('curvature-val');
            const zoomInput = document.getElementById('zoom');
            const zoomVal = document.getElementById('zoom-val');

            curvatureInput.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                material.uniforms.curvature.value = val;
                curvatureVal.innerText = Math.round(val * 100) + "%";
            });

            zoomInput.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                material.uniforms.zoom.value = val;
                zoomVal.innerText = Math.round(val * 100) + "%";
            });

            document.getElementById('shutter-btn').addEventListener('click', takePhoto);
            
            animate();
        }

        async function startCamera() {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
            
            const constraints = {
                video: {
                    facingMode: facingMode,
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                },
                audio: false
            };

            try {
                stream = await navigator.mediaDevices.getUserMedia(constraints);
                video.srcObject = stream;
                video.play();
            } catch (err) {
                console.error("Camera Error:", err);
                // alert("카메라 권한을 허용해주세요.");
            }
        }

        function toggleCamera() {
            facingMode = facingMode === 'user' ? 'environment' : 'user';
            startCamera();
        }

        function onWindowResize() {
            // window가 아닌 wrapper 크기 기준
            if (!wrapper) return;
            const width = wrapper.clientWidth;
            const height = wrapper.clientHeight;

            renderer.setSize(width, height);
            
            camera.left = width / -2;
            camera.right = width / 2;
            camera.top = height / 2;
            camera.bottom = height / -2;
            camera.updateProjectionMatrix();

            if(mesh) {
                mesh.geometry.dispose();
                mesh.geometry = new THREE.PlaneGeometry(width, height);
            }
            if(material) {
                material.uniforms.aspectRatio.value = width / height;
            }
        }

        function animate() {
            requestAnimationFrame(animate);
            renderer.render(scene, camera);
        }

        function takePhoto() {
            const flash = document.getElementById('flash');
            flash.style.opacity = 0.8;
            setTimeout(() => flash.style.opacity = 0, 150);

            render();
            
            try {
                const dataURL = renderer.domElement.toDataURL('image/jpeg', 0.95);
                const link = document.createElement('a');
                link.download = `convex_cam_${Date.now()}.jpg`;
                link.href = dataURL;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } catch (e) {
                console.error("Capture failed:", e);
            }
        }
        
        function render() {
            renderer.render(scene, camera);
        }
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
                float radius = 0.45; 
                if (r > radius) {
                    if (r < radius + 0.015) {
                        gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0); 
                    } else {
                        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); 
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

            const width = wrapper.clientWidth;
            const height = wrapper.clientHeight;

            camera = new THREE.OrthographicCamera(width / -2, width / 2, height / 2, height / -2, 1, 1000);
            camera.position.z = 1;

            renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true }); 
            renderer.setSize(width, height);
            renderer.setPixelRatio(window.devicePixelRatio);
            wrapper.appendChild(renderer.domElement);

            video = document.getElementById('video');
            startCamera();

            texture = new THREE.VideoTexture(video);
            texture.minFilter = THREE.LinearFilter;
            
            const geometry = new THREE.PlaneGeometry(width, height);
            
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

            window.addEventListener('resize', onWindowResize, false);
            
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
            }
        }

        function toggleCamera() {
            facingMode = facingMode === 'user' ? 'environment' : 'user';
            startCamera();
        }

        function onWindowResize() {
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

        function closeModal() {
            const modal = document.getElementById('save-modal');
            modal.classList.remove('visible-modal');
            modal.classList.add('hidden-modal');
        }

        function takePhoto() {
            const flash = document.getElementById('flash');
            flash.style.opacity = 0.8;
            setTimeout(() => flash.style.opacity = 0, 150);

            render();
            
            // 이미지 데이터 생성
            renderer.domElement.toBlob(async function(blob) {
                const fileName = `convex_cam_${Date.now()}.jpg`;
                const file = new File([blob], fileName, { type: 'image/jpeg' });
                
                // 1. 공유하기 시도 (가장 깔끔한 방법)
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    try {
                        await navigator.share({
                            files: [file],
                            title: 'Convex Mirror Photo',
                            text: '볼록 거울 카메라로 찍은 사진입니다.'
                        });
                        return; // 공유 성공 시 여기서 종료
                    } catch (err) {
                        console.log("Share failed or cancelled, falling back to modal");
                        // 사용자가 취소했거나 에러가 나면 아래 모달 로직으로 넘어감
                    }
                }

                // 2. 공유 실패 또는 미지원 시: 미리보기 모달 띄우기 (인앱 브라우저 대응)
                // Blob을 Data URL로 변환하여 이미지 태그에 넣음
                const reader = new FileReader();
                reader.onloadend = function() {
                    const resultImg = document.getElementById('result-image');
                    resultImg.src = reader.result;
                    
                    const modal = document.getElementById('save-modal');
                    modal.classList.remove('hidden-modal');
                    modal.classList.add('visible-modal');
                }
                reader.readAsDataURL(blob);

            }, 'image/jpeg', 0.95);
        }
        
        function render() {
            renderer.render(scene, camera);
        }

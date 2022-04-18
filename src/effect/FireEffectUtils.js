/**
 * 火焰特效
 * @author lidy
 * @since 2022-03-10
 *
 */


import * as THREE from 'three';

import flameMap from '../assets/texture/fireEffect/flame.png';
import emberMap from '../assets/texture/fireEffect/ember.png';
import hazeMap from '../assets/texture/fireEffect/haze.png';

class FireEffectUtils {
    constructor() {

        this.shaderParams = {
            //火焰shader
            fireVertexShader: null,
            fireFragmentShader: null,
            //火焰余烬shader
            embersVertexShader: null,
            embersFragmentShader: null,
            //火焰烟雾shader
            hazeVertexShader: null,
            hazeFragmentShader: null,
        }

        //创建shader（着色器）
        this._createFireShader();

        this.active = true;
    }

    /**
     * 销毁
     */
    dispose() {
        this.setActive(false);
    }

    setActive(active){
        this.active = active;
    }

    /**
     * 创建火焰特效
     */
    createFireEffectObject(renderer, camera, scene) {
        //火焰特效的group
        let fireEffectGroup = new THREE.Group();
        let dateTime = new Date().getTime();
        //火焰
        let fireGroup = new THREE.Group();
        fireGroup.name = "fireGroup-" + dateTime;
        fireEffectGroup.add(fireGroup);
        //火焰尾部
        let embersGroup = new THREE.Group();
        embersGroup.name = "embersGroup-" + dateTime;
        fireEffectGroup.add(embersGroup);
        //火焰烟雾
        let hazeGroup = new THREE.Group();
        hazeGroup.name = "hazeGroup-" + dateTime;
        fireEffectGroup.add(hazeGroup);

        this._createFire(fireGroup);
        this._createEmbers(embersGroup, fireGroup);
        this._createHaze(hazeGroup, fireGroup, renderer, camera, scene);

        return fireEffectGroup;
    }

    _random(min, max, precision) {
        var p = Math.pow(10, precision);
        return Math.round((min + Math.random() * (max - min)) * p) / p;
    }

    _createFire(targetGroup){
        let _this = this;

        var _geometry, _shader, _mesh, _group = targetGroup;
        var _num = 24;

        var _x = new THREE.Vector3(1, 0, 0);
        var _y = new THREE.Vector3(0, 1, 0);
        var _z = new THREE.Vector3(0, 0, 1);

        var _tipTarget = new THREE.Vector3();
        var _tip = new THREE.Vector3();
        var _diff = new THREE.Vector3();

        var _quat = new THREE.Quaternion();
        var _quat2 = new THREE.Quaternion();

        (function() {
            initGeometry();
            initInstances();
            initShader();
            initMesh();
            requestAnimationFrame(loop);
        })();

        function initGeometry() {
            _geometry = new THREE.InstancedBufferGeometry();
            _geometry.maxInstancedCount = _num;

            var shape = new THREE.PlaneBufferGeometry(2, 2);
            shape.translate(0, 1, 0);
            var data = shape.attributes;

            _geometry.addAttribute('position', new THREE.BufferAttribute(new Float32Array(data.position.array), 3));
            _geometry.addAttribute('uv', new THREE.BufferAttribute(new Float32Array(data.uv.array), 2));
            _geometry.addAttribute('normal', new THREE.BufferAttribute(new Float32Array(data.normal.array), 3));
            _geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(shape.index.array), 1));
            shape.dispose();
        }

        function initInstances() {
            var orientation = new THREE.InstancedBufferAttribute(new Float32Array(_num * 4), 4);
            var randoms = new THREE.InstancedBufferAttribute(new Float32Array(_num), 1);
            var scale = new THREE.InstancedBufferAttribute(new Float32Array(_num * 2), 2);
            var life = new THREE.InstancedBufferAttribute(new Float32Array(_num), 1);

            for (let i = 0; i < _num; i++) {
                orientation.setXYZW(i, 0, 0, 0, 1);
                life.setX(i, i / _num + 1);
            }

            _geometry.addAttribute('orientation', orientation);
            _geometry.addAttribute('scale', scale);
            _geometry.addAttribute('life', life);
            _geometry.addAttribute('random', randoms);
        }

        function initShader() {
            var uniforms = {
                uMap: {
                    type: 't',
                    value: null
                },
                uColor1: {
                    type: 'c',
                    value: new THREE.Color(0x961800)
                }, // red
                uColor2: {
                    type: 'c',
                    value: new THREE.Color(0x4b5828)
                }, // yellow
                uTime: {
                    type: 'f',
                    value: 0
                },
            };

            _shader = new THREE.ShaderMaterial({
                uniforms: uniforms,
                vertexShader: _this.shaderParams.fireVertexShader,
                fragmentShader: _this.shaderParams.fireFragmentShader,
                blending: THREE.AdditiveBlending,
                transparent: true,
                depthWrite: false,
                side: THREE.DoubleSide,
            });

            var textureLoader = new THREE.TextureLoader();
            textureLoader.load(flameMap, t => _shader.uniforms.uMap.value = t);
        }

        function initMesh() {
            _mesh = new THREE.Mesh(_geometry, _shader);
            _mesh.frustumCulled = false;
            targetGroup.add(_mesh);
        }

        function loop(e) {
            if(!_this.active){
                return;
            }
            requestAnimationFrame(loop);
            _shader.uniforms.uTime.value = e * 0.001;

            var life = _geometry.attributes.life;
            var orientation = _geometry.attributes.orientation;
            var scale = _geometry.attributes.scale;
            var randoms = _geometry.attributes.random;

            for (let i = 0; i < _num; i++) {
                var value = life.array[i];
                value += 0.04;

                if (value > 1) {
                    value -= 1;

                    _quat.setFromAxisAngle(_y, _this._random(0, 3.14, 3));
                    _quat2.setFromAxisAngle(_x, _this._random(-1, 1, 2) * 0.1);
                    _quat.multiply(_quat2);
                    _quat2.setFromAxisAngle(_z, _this._random(-1, 1, 2) * 0.3);
                    _quat.multiply(_quat2);
                    orientation.setXYZW(i, _quat.x, _quat.y, _quat.z, _quat.w);

                    scale.setXY(i, _this._random(0.8, 1.2, 3), _this._random(0.8, 1.2, 3));
                    randoms.setX(i, _this._random(0, 1, 3));
                }

                life.setX(i, value);
            }
            life.needsUpdate = true;
            orientation.needsUpdate = true;
            scale.needsUpdate = true;
            randoms.needsUpdate = true;

            //移动火苗
            /*_group.position.x = Math.sin(e * 0.002) * 1.4;
            _group.position.y = Math.cos(e * 0.0014) * 0.2;
            _group.position.z = Math.cos(e * 0.0014) * 0.5;*/

            let tipOffset = 0.4;
            _tipTarget.copy(_group.position);
            _tipTarget.y += tipOffset;
            _tip.lerp(_tipTarget, 0.1);

            _diff.copy(_tip);
            _diff.sub(_group.position);
            let length = _diff.length();
            _group.scale.y = (length / tipOffset - 1) * 0.4 + 1;

            _group.quaternion.setFromUnitVectors(_y, _diff.normalize());
        }
    }
    _createEmbers(targetGroup, fireGroup){
        let _this = this;
        var _geometry, _shader, _points;
        var _num = 8;

        (function() {
            initGeometry();
            initShader();
            initMesh();
            requestAnimationFrame(loop);
        })();

        function initGeometry() {
            _geometry = new THREE.BufferGeometry();
            _geometry.addAttribute('position', new THREE.BufferAttribute(new Float32Array(_num * 3), 3));
            _geometry.addAttribute('offset', new THREE.BufferAttribute(new Float32Array(_num * 3), 3));
            _geometry.addAttribute('size', new THREE.BufferAttribute(new Float32Array(_num), 1));
            _geometry.addAttribute('life', new THREE.BufferAttribute(new Float32Array(_num), 1));

            for (var i = 0; i < _num; i++) {
                _geometry.attributes.life.setX(i, _this._random(1, 2, 3) + 1);
            }
        }

        function initShader() {
            var uniforms = {
                uMap: {
                    type: 't',
                    value: null
                },
                uColor: {
                    type: 'c',
                    value: new THREE.Color(0xffe61e)
                },
            };

            _shader = new THREE.ShaderMaterial({
                uniforms: uniforms,
                vertexShader: _this.shaderParams.embersVertexShader,
                fragmentShader: _this.shaderParams.embersFragmentShader,
                blending: THREE.AdditiveBlending,
                transparent: true,
                // depthTest: false,
            });

            var textureLoader = new THREE.TextureLoader();
            textureLoader.load(emberMap, t => _shader.uniforms.uMap.value = t);
        }

        function initMesh() {
            _points = new THREE.Points(_geometry, _shader);
            _points.frustumCulled = false;
            targetGroup.add(_points);
        }

        function loop() {
            if(!_this.active){
                return;
            }
            requestAnimationFrame(loop);
            var life = _geometry.attributes.life;
            var position = _geometry.attributes.position;
            var size = _geometry.attributes.size;
            var offset = _geometry.attributes.offset;
            for (let i = 0; i < _num; i++) {
                var value = life.array[i];
                value += 0.02;

                if (value > 2) {
                    value -= 2;

                    position.setXYZ(i, fireGroup.position.x, fireGroup.position.y + 0.5, fireGroup.position.z);
                    offset.setXYZ(i,
                        _this._random(-0.2, 0.2, 3),
                        _this._random(0.7, 1.2, 3),
                        _this._random(-0.2, 0.2, 3)
                    );
                    size.setX(i, _this._random(0.6, 1.8, 3));
                }

                life.setX(i, value);
            }

            life.needsUpdate = true;
            position.needsUpdate = true;
            size.needsUpdate = true;
            offset.needsUpdate = true;
        }
    }
    _createHaze(targetGroup, fireGroup, renderer, camera, scene){
        let _this = this;

        var _geometry, _shader, _mesh, _renderTarget;
        var _width, _height;

        var _num = 6;

        var _z = new THREE.Vector3(0, 0, 1);
        var _quat = new THREE.Quaternion();
        var _quat2 = new THREE.Quaternion();

        (function() {
            resizeHaze();
            resetRT();
            initGeometry();
            initInstances();
            initShader();
            initMesh();
            requestAnimationFrame(loop);
        })();

        function resetRT() {
            var _parameters = {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                encoding: THREE.sRGBEncoding,
                stencilBuffer: false,
            };
            if (_renderTarget) _renderTarget.dispose();
            _renderTarget = new THREE.WebGLRenderTarget(_width * 0.5, _height * 0.5, _parameters);
        }

        function initGeometry() {
            _geometry = new THREE.InstancedBufferGeometry();
            _geometry.maxInstancedCount = _num;

            // var shape = new THREE.BoxBufferGeometry(1.5, 1.5, 1.5);
            var shape = new THREE.PlaneBufferGeometry(2, 2);
            var data = shape.attributes;

            _geometry.addAttribute('position', new THREE.BufferAttribute(new Float32Array(data.position.array), 3));
            _geometry.addAttribute('uv', new THREE.BufferAttribute(new Float32Array(data.uv.array), 2));
            _geometry.addAttribute('normal', new THREE.BufferAttribute(new Float32Array(data.normal.array), 3));
            _geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(shape.index.array), 1));
            shape.dispose();
        }

        function initInstances() {
            var base = new THREE.InstancedBufferAttribute(new Float32Array(_num * 3), 3);
            var offset = new THREE.InstancedBufferAttribute(new Float32Array(_num * 3), 3);
            var orientation = new THREE.InstancedBufferAttribute(new Float32Array(_num * 4), 4);
            var scale = new THREE.InstancedBufferAttribute(new Float32Array(_num * 2), 2);
            var rotation = new THREE.InstancedBufferAttribute(new Float32Array(_num), 1);
            var life = new THREE.InstancedBufferAttribute(new Float32Array(_num), 1);

            for (let i = 0; i < _num; i++) {
                orientation.setXYZW(i, 0, 0, 0, 1);
                life.setX(i, i / _num + 1);
            }

            _geometry.addAttribute('base', base);
            _geometry.addAttribute('offset', offset);
            _geometry.addAttribute('orientation', orientation);
            _geometry.addAttribute('scale', scale);
            _geometry.addAttribute('rotation', rotation);
            _geometry.addAttribute('life', life);
        }

        function initShader() {
            let dpr = renderer.getPixelRatio();
            var uniforms = {
                uMap: {
                    type: 't',
                    value: null
                },
                uMask: {
                    type: 't',
                    value: null
                },
                uResolution: {
                    type: 'v2',
                    value: new THREE.Vector2(_width * dpr, _height * dpr)
                },
            };

            _shader = new THREE.ShaderMaterial({
                uniforms: uniforms,
                vertexShader: _this.shaderParams.hazeVertexShader,
                fragmentShader: _this.shaderParams.hazeFragmentShader,
                transparent: true,
                depthTest: false,
            });

            var textureLoader = new THREE.TextureLoader();
            textureLoader.load(hazeMap, t => _shader.uniforms.uMask.value = t);
            _shader.uniforms.uMap.value = _renderTarget.texture;
        }

        function initMesh() {
            _mesh = new THREE.Mesh(_geometry, _shader);
            _mesh.frustumCulled = false;
            targetGroup.add(_mesh);
        }

        function resizeHaze() {
            _width = renderer.domElement.clientWidth;
            _height = renderer.domElement.clientHeight;
            if(_shader){
                _shader.uniforms.uResolution.value.set(_width * dpr, _height * dpr);
            }
        }

        function loop(e) {
            if(!_this.active){
                return;
            }
            requestAnimationFrame(loop);

            targetGroup.visible = false;
            let currentRenderTarget = renderer.getRenderTarget();
            renderer.setRenderTarget( _renderTarget );
            renderer.clear(true, true, true);
            renderer.render(scene, camera);
            renderer.setRenderTarget( currentRenderTarget );
            targetGroup.visible = true;

            var life = _geometry.attributes.life;
            var base = _geometry.attributes.base;
            var offset = _geometry.attributes.offset;
            var scale = _geometry.attributes.scale;
            var orientation = _geometry.attributes.orientation;
            var rotation = _geometry.attributes.rotation;
            for (let i = 0; i < _num; i++) {
                var value = life.array[i];
                value += 0.008;

                if (value > 0.5) {
                    value -= 0.5;

                    rotation.setX(i, _this._random(0, 3.14, 3));

                    base.setXYZ(i, fireGroup.position.x, fireGroup.position.y + 1.1, fireGroup.position.z);
                    offset.setXYZ(i,
                        _this._random(-0.2, 0.2, 3),
                        _this._random(2.5, 3.0, 3),
                        0
                    );
                    scale.setXY(i, _this._random(0.6, 1.2, 3), _this._random(0.6, 1.2, 3));
                }

                _quat.setFromRotationMatrix(camera.matrixWorld);
                _quat2.setFromAxisAngle(_z, rotation.array[i]);
                _quat.multiply(_quat2);
                orientation.setXYZW(i, _quat.x, _quat.y, _quat.z, _quat.w);

                life.setX(i, value);
            }

            life.needsUpdate = true;
            base.needsUpdate = true;
            scale.needsUpdate = true;
            offset.needsUpdate = true;
            orientation.needsUpdate = true;
        }
    }


    /**
     * 创建火焰的shader（着色器）
     * @private
     */
    _createFireShader(){
        this.shaderParams.fireVertexShader = `
            attribute vec4 orientation;
            attribute vec3 offset;
            attribute vec2 scale;
            attribute float life;
            attribute float random;
            
            varying vec2 vUv;
            varying float vRandom;
            varying float vAlpha;
            
            float range(float oldValue, float oldMin, float oldMax, float newMin, float newMax) {
                float oldRange = oldMax - oldMin;
                float newRange = newMax - newMin;
                return (((oldValue - oldMin) * newRange) / oldRange) + newMin;
            }
            
            float pcurve(float x, float a, float b) {
                float k = pow(a + b, a + b) / (pow(a, a) * pow(b, b));
                return k * pow(x, a) * pow(1.0 - x, b);
            }
            
            void main() {
                vUv = uv;
                vRandom = random;
            
                vAlpha = pcurve(life, 1.0, 2.0);
            
                vec3 pos = position;
            
                pos.xy *= scale * vec2(range(pow(life, 1.5), 0.0, 1.0, 1.0, 0.6), range(pow(life, 1.5), 0.0, 1.0, 0.6, 1.2));
            
                vec4 or = orientation;
                vec3 vcV = cross(or.xyz, pos);
                pos = vcV * (2.0 * or.w) + (cross(or.xyz, vcV) * 2.0 + pos);
            
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `;
        this.shaderParams.fireFragmentShader = `
            uniform sampler2D uMap;
            uniform vec3 uColor1;
            uniform vec3 uColor2;
            uniform float uTime;
            
            varying vec2 vUv;
            varying float vAlpha;
            varying float vRandom;
            
            void main() {
                vec2 uv = vUv;
            
                float spriteLength = 10.0;
                uv.x /= spriteLength;
                float spriteIndex = mod(uTime * 0.1 + vRandom * 2.0, 1.0);
                uv.x += floor(spriteIndex * spriteLength) / spriteLength;
            
                vec4 map = texture2D(uMap, uv);
            
                gl_FragColor.rgb = mix(uColor2, uColor1, map.r);
                gl_FragColor.a = vAlpha * map.a;
            }
        `;
        this.shaderParams.embersVertexShader = `
            attribute float size;
            attribute float life;
            attribute vec3 offset;
            
            varying float vAlpha;
            
            float impulse(float k, float x) {
                float h = k * x;
                return h * exp(1.0 - h);
            }
            
            void main() {
                vAlpha = impulse(6.28, life);
            
                vec3 pos = position;
                pos += offset * vec3(life * 0.7 + 0.3, life * 0.9 + 0.1, life * 0.7 + 0.3);
            
                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                gl_PointSize = size * (80.0 / length(mvPosition.xyz));
                gl_Position = projectionMatrix * mvPosition;
            }
        `;
        this.shaderParams.embersFragmentShader = `
            uniform sampler2D uMap;
            uniform vec3 uColor;
            
            varying float vAlpha;
            
            void main() {
                vec2 uv = vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y);
                vec4 mask = texture2D(uMap, uv);
            
                gl_FragColor.rgb = uColor;
                gl_FragColor.a = mask.a * vAlpha * 0.8;
            }
        `;
        this.shaderParams.hazeVertexShader = `
            attribute vec3 base;
            attribute vec3 offset;
            attribute vec4 orientation;
            attribute vec2 scale;
            attribute float life;
            
            varying float vAlpha;
            varying vec2 vUv;
            
            float impulse(float k, float x) {
                float h = k * x;
                return h * exp(1.0 - h);
            }
            
            float pcurve(float x, float a, float b) {
                float k = pow(a + b, a + b) / (pow(a, a) * pow(b, b));
                return k * pow(x, a) * pow(1.0 - x, b);
            }
            
            void main() {
                vUv = uv;
                vAlpha = pcurve(life, 1.0, 2.0);
            
                vec3 pos = position;
            
                pos.xy *= scale * (life * 0.7 + 0.3);
            
                vec4 or = orientation;
                vec3 vcV = cross(or.xyz, pos);
                pos = vcV * (2.0 * or.w) + (cross(or.xyz, vcV) * 2.0 + pos);
            
                pos += base;
                pos += offset * vec3(life * 0.7 + 0.3, life * 0.9 + 0.1, life * 0.7 + 0.3);
            
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);;
            }
        `;
        this.shaderParams.hazeFragmentShader = `
            uniform sampler2D uMap;
            uniform sampler2D uMask;
            uniform vec2 uResolution;
            
            varying float vAlpha;
            varying vec2 vUv;
            
            void main() {
                vec2 uv = gl_FragCoord.xy / uResolution;
                vec2 mask = texture2D(uMask, vUv).ra - vec2(0.5);
                uv -= mask * 0.1;
                vec4 tex = texture2D(uMap, uv);
                if(tex.r < 0.1 && tex.g < 0.1 && tex.b < 0.1){
                    discard;
                }else{
                    gl_FragColor.rgb = tex.rgb;
                    gl_FragColor.a = 1.0;
                }
            }
        `;
    }
}

export default FireEffectUtils;


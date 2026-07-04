import { Suspense, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Float, MeshDistortMaterial, Sparkles } from '@react-three/drei'
import * as THREE from 'three'

function Orb({
  position,
  color,
  scale,
  distort,
  speed,
  emissive,
  opacity,
}: {
  position: [number, number, number]
  color: string
  scale: number
  distort: number
  speed: number
  emissive: number
  opacity: number
}) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.12
  })
  return (
    <Float speed={1.1} rotationIntensity={0.5} floatIntensity={0.7}>
      <mesh ref={ref} position={position} scale={scale}>
        <icosahedronGeometry args={[1, 14]} />
        <MeshDistortMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emissive}
          roughness={0.3}
          metalness={0.2}
          distort={distort}
          speed={speed}
          transparent
          opacity={opacity}
        />
      </mesh>
    </Float>
  )
}

/** Gentle parallax: the whole scene leans toward the pointer. */
function Rig({ children }: { children: React.ReactNode }) {
  const group = useRef<THREE.Group>(null)
  useFrame((state) => {
    if (!group.current) return
    group.current.rotation.y = THREE.MathUtils.lerp(
      group.current.rotation.y,
      state.pointer.x * 0.3,
      0.04,
    )
    group.current.rotation.x = THREE.MathUtils.lerp(
      group.current.rotation.x,
      -state.pointer.y * 0.2,
      0.04,
    )
  })
  return <group ref={group}>{children}</group>
}

function Scene() {
  return (
    <>
      <fog attach="fog" args={['#0b0d12', 5, 13]} />
      <ambientLight intensity={0.5} />
      <pointLight position={[5, 3, 4]} intensity={28} color="#ff4655" distance={25} />
      <pointLight position={[-5, -3, 3]} intensity={18} color="#00e5c0" distance={25} />
      <Rig>
        <Orb position={[3.5, 1.8, -3.5]} color="#ff3b4d" scale={1.35} distort={0.45} speed={1.4} emissive={0.55} opacity={0.6} />
        <Orb position={[-3.6, -1.9, -3]} color="#00e5c0" scale={0.95} distort={0.5} speed={2} emissive={0.6} opacity={0.6} />
        <Sparkles count={90} scale={[14, 9, 6]} size={2} speed={0.25} color="#9fe6ff" opacity={0.55} />
      </Rig>
    </>
  )
}

/**
 * Fixed WebGL backdrop behind the whole app. The dark base + CSS glows on the
 * container render immediately; the Canvas layers on top (transparent), so if
 * WebGL is unavailable the tactical background still looks intentional.
 */
export function TacticalBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* Guaranteed CSS glow orbs — rich even where WebGL is weak/absent. */}
      <div className="animate-drift absolute -right-40 top-[-10rem] size-[46rem] rounded-full bg-primary/20 blur-[130px]" />
      <div className="animate-drift-slow absolute -left-52 bottom-[-12rem] size-[38rem] rounded-full bg-cyan/15 blur-[130px]" />
      {/* Crisp WebGL layer on top for GPU clients. */}
      <Canvas
        className="!absolute inset-0"
        camera={{ position: [0, 0, 6.5], fov: 45 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
    </div>
  )
}

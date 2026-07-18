import { BuiltInSceneExpansionModel, isBuiltInSceneExpansionModel } from "./BuiltInSceneExpansionModel";

type PartProps = {
  color: string;
  position: [number, number, number];
  scale: [number, number, number];
  rotation?: [number, number, number];
};

function BoxPart({ color, position, rotation, scale }: PartProps) {
  return (
    <mesh castShadow receiveShadow position={position} rotation={rotation} scale={scale}>
      <boxGeometry />
      <meshStandardMaterial color={color} metalness={0.04} roughness={0.62} />
    </mesh>
  );
}

function CylinderPart({ color, position, rotation, scale }: PartProps) {
  return (
    <mesh castShadow receiveShadow position={position} rotation={rotation} scale={scale}>
      <cylinderGeometry args={[0.5, 0.5, 1, 20]} />
      <meshStandardMaterial color={color} metalness={0.08} roughness={0.58} />
    </mesh>
  );
}

function SpherePart({ color, position, rotation, scale }: PartProps) {
  return (
    <mesh castShadow receiveShadow position={position} rotation={rotation} scale={scale}>
      <sphereGeometry args={[0.5, 16, 12]} />
      <meshStandardMaterial color={color} metalness={0.04} roughness={0.72} />
    </mesh>
  );
}

function TorusPart({ color, position, rotation, scale }: PartProps) {
  return (
    <mesh castShadow receiveShadow position={position} rotation={rotation} scale={scale}>
      <torusGeometry args={[0.5, 0.1, 10, 28]} />
      <meshStandardMaterial color={color} metalness={0.12} roughness={0.56} />
    </mesh>
  );
}

function Wheel({ x, z, radius = 0.22 }: { x: number; z: number; radius?: number }) {
  return (
    <CylinderPart
      color="#161b22"
      position={[x, radius, z]}
      rotation={[Math.PI / 2, 0, 0]}
      scale={[radius * 2, 0.14, radius * 2]}
    />
  );
}

function Vehicle({ color, kind }: { color: string; kind: "sedan" | "suv" | "bus" }) {
  const bus = kind === "bus";
  const suv = kind === "suv";
  const bodyY = bus ? 0.72 : suv ? 0.58 : 0.5;
  const bodyHeight = bus ? 1.2 : suv ? 0.68 : 0.48;
  const bodyLength = bus ? 2 : 1.75;
  const wheelX = bus ? 0.72 : 0.62;
  return (
    <group>
      <BoxPart color={color} position={[0, bodyY, 0]} scale={[bodyLength, bodyHeight, 0.82]} />
      {!bus ? (
        <BoxPart color={color} position={[0.08, suv ? 1.05 : 0.88, 0]} scale={[1.02, suv ? 0.52 : 0.38, 0.72]} />
      ) : null}
      <BoxPart color="#89b5c8" position={[bus ? 0 : 0.1, bus ? 1.07 : suv ? 1.08 : 0.91, 0.415]} scale={[bus ? 1.55 : 0.72, bus ? 0.45 : 0.25, 0.035]} />
      <BoxPart color="#dbe7ed" position={[-bodyLength / 2 - 0.01, bodyY + 0.04, 0]} scale={[0.035, 0.16, 0.58]} />
      <BoxPart color="#efcc55" position={[bodyLength / 2 + 0.01, bodyY + 0.04, 0]} scale={[0.035, 0.15, 0.54]} />
      <Wheel x={-wheelX} z={-0.46} radius={bus ? 0.25 : 0.22} />
      <Wheel x={wheelX} z={-0.46} radius={bus ? 0.25 : 0.22} />
      <Wheel x={-wheelX} z={0.46} radius={bus ? 0.25 : 0.22} />
      <Wheel x={wheelX} z={0.46} radius={bus ? 0.25 : 0.22} />
    </group>
  );
}

function Bicycle() {
  return (
    <group>
      {[-0.66, 0.66].map((x) => (
        <mesh key={x} castShadow position={[x, 0.47, 0]}>
          <torusGeometry args={[0.36, 0.045, 10, 28]} />
          <meshStandardMaterial color="#17212a" roughness={0.6} />
        </mesh>
      ))}
      <BoxPart color="#e85f4d" position={[0, 0.64, 0]} rotation={[0, 0, 0.58]} scale={[0.92, 0.07, 0.07]} />
      <BoxPart color="#e85f4d" position={[0.08, 0.64, 0]} rotation={[0, 0, -0.58]} scale={[0.82, 0.07, 0.07]} />
      <BoxPart color="#2d3741" position={[0.28, 1.03, 0]} rotation={[0, 0, -0.22]} scale={[0.06, 0.72, 0.06]} />
      <BoxPart color="#2d3741" position={[0.42, 1.34, 0]} scale={[0.42, 0.05, 0.05]} />
      <BoxPart color="#20262c" position={[-0.12, 1.04, 0]} scale={[0.3, 0.06, 0.16]} />
    </group>
  );
}

function Scooter() {
  return (
    <group>
      <BoxPart color="#3d566e" position={[0, 0.16, 0]} scale={[1.2, 0.12, 0.3]} />
      <BoxPart color="#3d566e" position={[0.45, 0.75, 0]} rotation={[0, 0, -0.08]} scale={[0.08, 1.25, 0.08]} />
      <BoxPart color="#202831" position={[0.44, 1.36, 0]} scale={[0.48, 0.06, 0.06]} />
      <Wheel x={-0.46} z={0} radius={0.16} />
      <Wheel x={0.48} z={0} radius={0.16} />
    </group>
  );
}

function Sofa() {
  return (
    <group>
      <BoxPart color="#b26d4f" position={[0, 0.46, 0]} scale={[1.8, 0.42, 0.82]} />
      <BoxPart color="#9b5c43" position={[0, 0.9, 0.28]} rotation={[-0.12, 0, 0]} scale={[1.72, 0.7, 0.2]} />
      <BoxPart color="#8b513b" position={[-0.88, 0.68, 0]} scale={[0.18, 0.5, 0.82]} />
      <BoxPart color="#8b513b" position={[0.88, 0.68, 0]} scale={[0.18, 0.5, 0.82]} />
      <BoxPart color="#3b302b" position={[-0.7, 0.12, 0]} scale={[0.12, 0.24, 0.12]} />
      <BoxPart color="#3b302b" position={[0.7, 0.12, 0]} scale={[0.12, 0.24, 0.12]} />
    </group>
  );
}

function DiningTable() {
  return (
    <group>
      <BoxPart color="#8b5a36" position={[0, 0.88, 0]} scale={[1.75, 0.14, 1.05]} />
      {[-0.7, 0.7].flatMap((x) => [-0.38, 0.38].map((z) => (
        <BoxPart key={`${x}:${z}`} color="#654128" position={[x, 0.43, z]} scale={[0.12, 0.86, 0.12]} />
      )))}
    </group>
  );
}

function Appliance({ washer = false }: { washer?: boolean }) {
  return (
    <group>
      <BoxPart color="#e6e9ec" position={[0, 0.92, 0]} scale={[1.05, 1.84, 0.9]} />
      {washer ? (
        <>
          <CylinderPart color="#273744" position={[0, 0.92, 0.47]} rotation={[Math.PI / 2, 0, 0]} scale={[0.56, 0.08, 0.56]} />
          <CylinderPart color="#81a8bc" position={[0, 0.92, 0.52]} rotation={[Math.PI / 2, 0, 0]} scale={[0.38, 0.08, 0.38]} />
          <BoxPart color="#303942" position={[0, 1.56, 0.47]} scale={[0.72, 0.12, 0.04]} />
        </>
      ) : (
        <>
          <BoxPart color="#b9c8ce" position={[0, 1.22, 0.46]} scale={[0.02, 1.25, 0.05]} />
          <BoxPart color="#69767c" position={[-0.12, 1.18, 0.5]} scale={[0.05, 0.42, 0.04]} />
          <BoxPart color="#69767c" position={[0.12, 1.18, 0.5]} scale={[0.05, 0.42, 0.04]} />
        </>
      )}
    </group>
  );
}

function StreetLamp() {
  return (
    <group>
      <CylinderPart color="#303940" position={[0, 0.12, 0]} scale={[0.5, 0.24, 0.5]} />
      <CylinderPart color="#3c474e" position={[0, 1.12, 0]} scale={[0.14, 2, 0.14]} />
      <BoxPart color="#3c474e" position={[0.32, 2.05, 0]} scale={[0.7, 0.1, 0.1]} />
      <BoxPart color="#f4d77a" position={[0.65, 1.93, 0]} scale={[0.38, 0.18, 0.3]} />
    </group>
  );
}

function Tree() {
  return (
    <group>
      <CylinderPart color="#735139" position={[0, 0.68, 0]} scale={[0.28, 1.36, 0.28]} />
      <mesh castShadow position={[0, 1.6, 0]}><sphereGeometry args={[0.72, 12, 9]} /><meshStandardMaterial color="#4d8a55" roughness={0.9} /></mesh>
      <mesh castShadow position={[-0.45, 1.42, 0.12]}><sphereGeometry args={[0.45, 10, 8]} /><meshStandardMaterial color="#5c9c5d" roughness={0.9} /></mesh>
      <mesh castShadow position={[0.43, 1.48, -0.08]}><sphereGeometry args={[0.5, 10, 8]} /><meshStandardMaterial color="#397849" roughness={0.9} /></mesh>
    </group>
  );
}

function TrashBins() {
  return <group>{[-0.5, 0, 0.5].map((x, index) => <BoxPart key={x} color={["#4386b2", "#4b9664", "#d09144"][index]} position={[x, 0.52, 0]} scale={[0.42, 1.02, 0.48]} />)}</group>;
}

function LegacyProp({ modelId }: { modelId: string }) {
  if (modelId.includes("atm")) return <><BoxPart color="#315e78" position={[0, 0.9, 0]} scale={[1.1, 1.8, 0.72]} /><BoxPart color="#172b38" position={[0, 1.2, 0.38]} rotation={[-0.16, 0, 0]} scale={[0.68, 0.45, 0.05]} /><BoxPart color="#87b9c9" position={[0, 1.23, 0.42]} rotation={[-0.16, 0, 0]} scale={[0.52, 0.3, 0.03]} /></>;
  if (modelId.includes("backpack")) return <><BoxPart color="#516b55" position={[0, 0.72, 0]} scale={[0.9, 1.3, 0.55]} /><BoxPart color="#334837" position={[0, 0.42, 0.32]} scale={[0.65, 0.42, 0.2]} /></>;
  if (modelId.includes("thermus")) return <><CylinderPart color="#bfc8cc" position={[0, 0.75, 0]} scale={[0.5, 1.5, 0.5]} /><CylinderPart color="#37434a" position={[0, 1.55, 0]} scale={[0.42, 0.16, 0.42]} /></>;
  if (modelId.includes("wrench")) return <><BoxPart color="#8d999f" position={[0, 0.16, 0]} rotation={[0, 0.35, 0]} scale={[1.6, 0.16, 0.24]} /><mesh position={[0.72, 0.18, -0.26]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.25, 0.08, 8, 18]} /><meshStandardMaterial color="#8d999f" metalness={0.6} roughness={0.35} /></mesh></>;
  if (modelId.includes("drill_press")) return <><BoxPart color="#3f5961" position={[0, 0.12, 0]} scale={[1.1, 0.24, 0.8]} /><CylinderPart color="#606c70" position={[0, 0.9, 0]} scale={[0.16, 1.6, 0.16]} /><BoxPart color="#315b60" position={[0, 1.5, 0]} scale={[0.78, 0.42, 0.52]} /></>;
  if (modelId.includes("deer_skull")) return <><BoxPart color="#d5c9aa" position={[0, 0.75, 0]} rotation={[0, 0, 0.15]} scale={[0.42, 0.7, 0.25]} /><BoxPart color="#d5c9aa" position={[-0.42, 1.25, 0]} rotation={[0, 0, -0.5]} scale={[0.55, 0.08, 0.08]} /><BoxPart color="#d5c9aa" position={[0.42, 1.25, 0]} rotation={[0, 0, 0.5]} scale={[0.55, 0.08, 0.08]} /></>;
  return <BoxPart color="#73808a" position={[0, 0.5, 0]} scale={[1, 1, 1]} />;
}

function ExpandedLifeModel({ modelId }: { modelId: string }) {
  if (modelId.includes("door_single")) return (
    <group>
      <BoxPart color="#594332" position={[0, 1.05, 0]} scale={[1.25, 2.1, 0.14]} />
      <BoxPart color="#2f2520" position={[-0.7, 1.12, 0]} scale={[0.12, 2.25, 0.22]} />
      <BoxPart color="#2f2520" position={[0.7, 1.12, 0]} scale={[0.12, 2.25, 0.22]} />
      <BoxPart color="#2f2520" position={[0, 2.2, 0]} scale={[1.52, 0.14, 0.22]} />
      <SpherePart color="#d3b565" position={[0.45, 1.02, 0.11]} scale={[0.12, 0.12, 0.12]} />
    </group>
  );
  if (modelId.includes("window_wall")) return (
    <group>
      <BoxPart color="#78a7bd" position={[0, 1.1, 0]} scale={[1.6, 1.35, 0.06]} />
      <BoxPart color="#d6dde0" position={[-0.87, 1.1, 0]} scale={[0.14, 1.7, 0.16]} />
      <BoxPart color="#d6dde0" position={[0.87, 1.1, 0]} scale={[0.14, 1.7, 0.16]} />
      <BoxPart color="#d6dde0" position={[0, 0.28, 0]} scale={[1.88, 0.14, 0.16]} />
      <BoxPart color="#d6dde0" position={[0, 1.92, 0]} scale={[1.88, 0.14, 0.16]} />
      <BoxPart color="#d6dde0" position={[0, 1.1, 0]} scale={[0.1, 1.55, 0.14]} />
    </group>
  );
  if (modelId.includes("stairs")) return (
    <group>{Array.from({ length: 6 }, (_, index) => (
      <BoxPart key={index} color="#7c858b" position={[0, 0.12 + index * 0.18, -0.65 + index * 0.24]} scale={[1.8, 0.24, 0.5]} />
    ))}</group>
  );
  if (modelId.includes("fence")) return (
    <group>
      {[-1, 0, 1].map((x) => <BoxPart key={x} color="#616d73" position={[x, 0.75, 0]} scale={[0.12, 1.5, 0.12]} />)}
      {[0.45, 1.02].map((y) => <BoxPart key={y} color="#76848a" position={[0, y, 0]} scale={[2.15, 0.1, 0.1]} />)}
    </group>
  );
  if (modelId.includes("bus_shelter")) return (
    <group>
      {[-1, 1].map((x) => <BoxPart key={x} color="#48555d" position={[x, 1.15, 0]} scale={[0.12, 2.3, 0.12]} />)}
      <BoxPart color="#5b6971" position={[0, 2.28, 0]} scale={[2.25, 0.14, 1.05]} />
      <BoxPart color="#6f9baa" position={[0, 1.18, 0.43]} scale={[2.05, 1.8, 0.06]} />
      <BoxPart color="#66737a" position={[0, 0.62, 0]} scale={[1.45, 0.14, 0.55]} />
      <BoxPart color="#505b61" position={[0, 0.35, 0.2]} scale={[1.45, 0.55, 0.12]} />
    </group>
  );

  if (modelId.includes("office_desk")) return (
    <group>
      <BoxPart color="#a0714b" position={[0, 0.82, 0]} scale={[1.8, 0.14, 0.85]} />
      {[-0.72, 0.72].flatMap((x) => [-0.3, 0.3].map((z) => <BoxPart key={`${x}:${z}`} color="#5c6268" position={[x, 0.4, z]} scale={[0.1, 0.8, 0.1]} />))}
      <BoxPart color="#59636b" position={[0.58, 0.58, 0]} scale={[0.45, 0.35, 0.7]} />
    </group>
  );
  if (modelId.includes("office_chair")) return (
    <group>
      <BoxPart color="#30465c" position={[0, 0.78, 0]} scale={[0.72, 0.18, 0.72]} />
      <BoxPart color="#30465c" position={[0, 1.25, 0.28]} rotation={[-0.12, 0, 0]} scale={[0.7, 0.78, 0.16]} />
      <CylinderPart color="#59636b" position={[0, 0.4, 0]} scale={[0.12, 0.65, 0.12]} />
      {[0, 1, 2, 3, 4].map((index) => <BoxPart key={index} color="#424a50" position={[Math.cos(index * Math.PI * 0.4) * 0.33, 0.12, Math.sin(index * Math.PI * 0.4) * 0.33]} rotation={[0, -index * Math.PI * 0.4, 0]} scale={[0.52, 0.07, 0.07]} />)}
    </group>
  );
  if (modelId.includes("desktop_computer")) return (
    <group>
      <BoxPart color="#222b32" position={[0, 1.05, 0]} scale={[1.1, 0.72, 0.12]} />
      <BoxPart color="#6fa6bd" position={[0, 1.06, 0.07]} scale={[0.94, 0.56, 0.03]} />
      <CylinderPart color="#4c565d" position={[0, 0.55, 0]} scale={[0.11, 0.45, 0.11]} />
      <BoxPart color="#4c565d" position={[0, 0.3, 0]} scale={[0.65, 0.08, 0.36]} />
      <BoxPart color="#303940" position={[0.85, 0.62, 0]} scale={[0.4, 1.2, 0.65]} />
      <BoxPart color="#59666e" position={[0, 0.18, 0.55]} scale={[1.0, 0.08, 0.32]} />
    </group>
  );
  if (modelId.includes("filing_cabinet")) return (
    <group>
      <BoxPart color="#7b858b" position={[0, 0.85, 0]} scale={[0.85, 1.7, 0.65]} />
      {[0.38, 0.82, 1.26].map((y) => <BoxPart key={y} color="#9ca5aa" position={[0, y, 0.34]} scale={[0.72, 0.34, 0.04]} />)}
      {[0.38, 0.82, 1.26].map((y) => <BoxPart key={`h:${y}`} color="#3c454b" position={[0, y, 0.38]} scale={[0.22, 0.04, 0.05]} />)}
    </group>
  );
  if (modelId.includes("vending_machine")) return (
    <group>
      <BoxPart color="#cf5960" position={[0, 1.05, 0]} scale={[1.05, 2.1, 0.72]} />
      <BoxPart color="#263c4a" position={[-0.12, 1.35, 0.38]} scale={[0.68, 0.95, 0.05]} />
      {[1.08, 1.35, 1.62].map((y) => <BoxPart key={y} color="#8dd1e0" position={[-0.12, y, 0.42]} scale={[0.55, 0.06, 0.03]} />)}
      <BoxPart color="#202a31" position={[0.24, 0.45, 0.4]} scale={[0.28, 0.18, 0.05]} />
    </group>
  );

  if (modelId.includes("gas_stove")) return (
    <group>
      <BoxPart color="#d4d7d8" position={[0, 0.48, 0]} scale={[1.25, 0.9, 0.78]} />
      {[-0.36, 0.36].flatMap((x) => [-0.22, 0.22].map((z) => <CylinderPart key={`${x}:${z}`} color="#272d31" position={[x, 0.96, z]} scale={[0.34, 0.06, 0.34]} />))}
      {[-0.35, 0, 0.35].map((x) => <CylinderPart key={x} color="#4b555b" position={[x, 0.58, 0.42]} rotation={[Math.PI / 2, 0, 0]} scale={[0.12, 0.08, 0.12]} />)}
    </group>
  );
  if (modelId.includes("microwave")) return (
    <group>
      <BoxPart color="#d8dcdd" position={[0, 0.55, 0]} scale={[1.35, 0.9, 0.78]} />
      <BoxPart color="#26353e" position={[-0.14, 0.58, 0.42]} scale={[0.85, 0.6, 0.05]} />
      <CylinderPart color="#5c666b" position={[0.5, 0.68, 0.43]} rotation={[Math.PI / 2, 0, 0]} scale={[0.14, 0.08, 0.14]} />
      <BoxPart color="#5c666b" position={[0.5, 0.38, 0.43]} scale={[0.22, 0.08, 0.05]} />
    </group>
  );
  if (modelId.includes("kitchen_sink")) return (
    <group>
      <BoxPart color="#b9c2c6" position={[0, 0.85, 0]} scale={[1.5, 0.16, 0.9]} />
      <BoxPart color="#53636b" position={[0, 0.88, 0]} scale={[0.82, 0.06, 0.5]} />
      {[-0.58, 0.58].flatMap((x) => [-0.3, 0.3].map((z) => <BoxPart key={`${x}:${z}`} color="#737f85" position={[x, 0.4, z]} scale={[0.1, 0.8, 0.1]} />))}
      <CylinderPart color="#8a969b" position={[0, 1.18, -0.18]} scale={[0.1, 0.62, 0.1]} />
      <BoxPart color="#8a969b" position={[0, 1.45, 0]} scale={[0.1, 0.1, 0.42]} />
    </group>
  );
  if (modelId.includes("kitchen_cabinet")) return (
    <group>
      <BoxPart color="#d6c0a2" position={[0, 0.55, 0]} scale={[1.5, 1.1, 0.7]} />
      <BoxPart color="#f0e4d3" position={[-0.37, 0.58, 0.37]} scale={[0.68, 0.92, 0.05]} />
      <BoxPart color="#f0e4d3" position={[0.37, 0.58, 0.37]} scale={[0.68, 0.92, 0.05]} />
      <SpherePart color="#6e6255" position={[-0.08, 0.58, 0.43]} scale={[0.07, 0.07, 0.07]} />
      <SpherePart color="#6e6255" position={[0.08, 0.58, 0.43]} scale={[0.07, 0.07, 0.07]} />
    </group>
  );
  if (modelId.includes("coffee_machine")) return (
    <group>
      <BoxPart color="#30383d" position={[0, 0.72, 0]} scale={[0.72, 1.25, 0.64]} />
      <BoxPart color="#8c999e" position={[0, 1.18, 0.34]} scale={[0.48, 0.22, 0.05]} />
      <CylinderPart color="#b7c1c4" position={[0, 0.76, 0.35]} scale={[0.08, 0.38, 0.08]} />
      <BoxPart color="#8c999e" position={[0, 0.22, 0.24]} scale={[0.55, 0.08, 0.48]} />
      <CylinderPart color="#e2e4df" position={[0, 0.42, 0.27]} scale={[0.25, 0.32, 0.25]} />
    </group>
  );

  if (modelId.includes("hospital_bed")) return (
    <group>
      <BoxPart color="#dfe8e9" position={[0, 0.68, 0]} scale={[2.0, 0.22, 0.88]} />
      <BoxPart color="#77aab5" position={[0, 0.49, 0]} scale={[2.1, 0.12, 0.92]} />
      <BoxPart color="#a8c7cd" position={[-1.02, 0.92, 0]} scale={[0.1, 0.85, 0.92]} />
      <BoxPart color="#a8c7cd" position={[1.02, 0.76, 0]} scale={[0.1, 0.55, 0.92]} />
      {[-0.8, 0.8].flatMap((x) => [-0.34, 0.34].map((z) => <CylinderPart key={`${x}:${z}`} color="#68757b" position={[x, 0.26, z]} scale={[0.08, 0.5, 0.08]} />))}
    </group>
  );
  if (modelId.includes("wheelchair")) return (
    <group>
      <TorusPart color="#27333a" position={[-0.18, 0.58, -0.48]} scale={[0.92, 0.92, 0.92]} />
      <TorusPart color="#27333a" position={[-0.18, 0.58, 0.48]} scale={[0.92, 0.92, 0.92]} />
      <BoxPart color="#35667a" position={[0, 0.82, 0]} scale={[0.78, 0.16, 0.78]} />
      <BoxPart color="#35667a" position={[-0.28, 1.22, 0]} rotation={[0, 0, -0.12]} scale={[0.16, 0.78, 0.78]} />
      <BoxPart color="#68757b" position={[0.42, 0.45, 0]} rotation={[0, 0, -0.3]} scale={[0.08, 0.95, 0.08]} />
    </group>
  );
  if (modelId.includes("first_aid_kit")) return (
    <group>
      <BoxPart color="#f1f3ef" position={[0, 0.55, 0]} scale={[1.0, 0.72, 0.42]} />
      <BoxPart color="#d84d4d" position={[0, 0.55, 0.23]} scale={[0.48, 0.14, 0.04]} />
      <BoxPart color="#d84d4d" position={[0, 0.55, 0.23]} scale={[0.14, 0.48, 0.04]} />
      <TorusPart color="#69747a" position={[0, 1.0, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.32, 0.2, 0.32]} />
    </group>
  );
  if (modelId.includes("fire_extinguisher")) return (
    <group>
      <CylinderPart color="#d94842" position={[0, 0.62, 0]} scale={[0.48, 1.15, 0.48]} />
      <CylinderPart color="#b8c0c3" position={[0, 1.25, 0]} scale={[0.22, 0.18, 0.22]} />
      <BoxPart color="#303a40" position={[0.18, 1.38, 0]} rotation={[0, 0, -0.28]} scale={[0.48, 0.08, 0.12]} />
      <BoxPart color="#333d42" position={[0.38, 0.86, 0]} rotation={[0, 0, -0.18]} scale={[0.08, 0.75, 0.08]} />
    </group>
  );
  if (modelId.includes("emergency_beacon")) return (
    <group>
      <CylinderPart color="#343e44" position={[0, 0.12, 0]} scale={[0.72, 0.24, 0.72]} />
      <CylinderPart color="#e59b32" position={[0, 0.52, 0]} scale={[0.5, 0.72, 0.5]} />
      <CylinderPart color="#f5c45d" position={[0, 0.92, 0]} scale={[0.36, 0.12, 0.36]} />
    </group>
  );

  if (modelId.includes("cinema_camera")) return (
    <group>
      <BoxPart color="#242b30" position={[0, 1.42, 0]} scale={[0.9, 0.58, 0.55]} />
      <CylinderPart color="#151b1f" position={[0.48, 1.42, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.38, 0.55, 0.38]} />
      <CylinderPart color="#59656b" position={[0, 0.78, 0]} scale={[0.1, 1.0, 0.1]} />
      {[-0.42, 0.42].map((x) => <BoxPart key={x} color="#59656b" position={[x, 0.34, 0]} rotation={[0, 0, x < 0 ? -0.42 : 0.42]} scale={[0.08, 0.88, 0.08]} />)}
      <BoxPart color="#59656b" position={[0, 0.34, 0.35]} rotation={[0.45, 0, 0]} scale={[0.08, 0.88, 0.08]} />
    </group>
  );
  if (modelId.includes("studio_light")) return (
    <group>
      <CylinderPart color="#5b666c" position={[0, 0.82, 0]} scale={[0.09, 1.5, 0.09]} />
      <BoxPart color="#2b3338" position={[0, 1.72, 0]} rotation={[0.08, 0, 0]} scale={[0.85, 0.62, 0.2]} />
      <BoxPart color="#f1d780" position={[0, 1.72, 0.11]} scale={[0.66, 0.44, 0.04]} />
      {[-0.36, 0.36].map((x) => <BoxPart key={x} color="#5b666c" position={[x, 0.25, 0]} rotation={[0, 0, x < 0 ? -0.52 : 0.52]} scale={[0.07, 0.65, 0.07]} />)}
    </group>
  );
  if (modelId.includes("boom_microphone")) return (
    <group>
      <BoxPart color="#525e64" position={[0, 1.15, 0]} rotation={[0, 0, -0.58]} scale={[2.1, 0.07, 0.07]} />
      <CylinderPart color="#20282d" position={[0.88, 1.78, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.16, 0.58, 0.16]} />
      <CylinderPart color="#606b70" position={[-0.74, 0.62, 0]} scale={[0.08, 1.1, 0.08]} />
      <BoxPart color="#606b70" position={[-0.74, 0.12, 0]} scale={[0.8, 0.08, 0.45]} />
    </group>
  );
  if (modelId.includes("clapperboard")) return (
    <group>
      <BoxPart color="#20272b" position={[0, 0.55, 0]} scale={[1.1, 0.72, 0.12]} />
      <BoxPart color="#e3e5df" position={[0, 0.98, 0]} rotation={[0, 0, 0.12]} scale={[1.18, 0.16, 0.14]} />
      {[-0.38, 0, 0.38].map((x) => <BoxPart key={x} color="#252c30" position={[x, 0.98 + x * 0.05, 0.08]} rotation={[0, 0, 0.12]} scale={[0.18, 0.16, 0.03]} />)}
    </group>
  );
  if (modelId.includes("speaker")) return (
    <group>
      <BoxPart color="#232a2e" position={[0, 0.75, 0]} scale={[0.78, 1.5, 0.62]} />
      <CylinderPart color="#4c5960" position={[0, 0.55, 0.34]} rotation={[Math.PI / 2, 0, 0]} scale={[0.52, 0.08, 0.52]} />
      <CylinderPart color="#69777e" position={[0, 1.15, 0.34]} rotation={[Math.PI / 2, 0, 0]} scale={[0.28, 0.08, 0.28]} />
    </group>
  );

  if (modelId.includes("rock")) return (
    <mesh castShadow receiveShadow position={[0, 0.45, 0]} scale={[1.25, 0.9, 1]} rotation={[0.18, 0.3, -0.08]}>
      <dodecahedronGeometry args={[0.62, 0]} />
      <meshStandardMaterial color="#737572" roughness={0.95} />
    </mesh>
  );
  if (modelId.includes("shrub")) return (
    <group>
      <SpherePart color="#477a4d" position={[0, 0.55, 0]} scale={[1.3, 0.9, 1.05]} />
      <SpherePart color="#5a8d58" position={[-0.55, 0.45, 0.12]} scale={[0.78, 0.7, 0.72]} />
      <SpherePart color="#376a43" position={[0.55, 0.48, -0.08]} scale={[0.82, 0.72, 0.76]} />
    </group>
  );
  if (modelId.includes("flower_pot")) return (
    <group>
      <CylinderPart color="#a65f3f" position={[0, 0.35, 0]} scale={[0.72, 0.7, 0.72]} />
      <CylinderPart color="#74432f" position={[0, 0.7, 0]} scale={[0.82, 0.12, 0.82]} />
      <SpherePart color="#4e8a52" position={[0, 1.12, 0]} scale={[0.92, 0.85, 0.92]} />
      <SpherePart color="#659d62" position={[-0.36, 1.02, 0.08]} scale={[0.58, 0.58, 0.58]} />
    </group>
  );
  if (modelId.includes("park_bench")) return (
    <group>
      {[0.55, 0.82, 1.09].map((y) => <BoxPart key={y} color="#8a5c38" position={[0, y, y === 0.55 ? 0 : 0.32]} scale={[1.85, 0.12, y === 0.55 ? 0.62 : 0.12]} />)}
      {[-0.72, 0.72].map((x) => <BoxPart key={x} color="#424c51" position={[x, 0.3, 0]} scale={[0.1, 0.6, 0.5]} />)}
    </group>
  );
  if (modelId.includes("direction_sign")) return (
    <group>
      <CylinderPart color="#59656b" position={[0, 0.9, 0]} scale={[0.12, 1.8, 0.12]} />
      <BoxPart color="#3f7b72" position={[0.38, 1.45, 0]} scale={[0.95, 0.3, 0.12]} />
      <BoxPart color="#4f7893" position={[-0.38, 1.05, 0]} scale={[0.95, 0.3, 0.12]} />
      <BoxPart color="#59656b" position={[0, 0.08, 0]} scale={[0.72, 0.16, 0.72]} />
    </group>
  );

  return <LegacyProp modelId={modelId} />;
}

export function BuiltInLifeModel({ modelId }: { modelId: string }) {
  const id = modelId.toLowerCase();
  if (isBuiltInSceneExpansionModel(id)) return <BuiltInSceneExpansionModel modelId={id} />;
  if (id.includes("sedan")) return <Vehicle color="#4b7cac" kind="sedan" />;
  if (id.includes("suv")) return <Vehicle color="#6b7650" kind="suv" />;
  if (id.includes("city_bus")) return <Vehicle color="#d5a13a" kind="bus" />;
  if (id.includes("bicycle")) return <Bicycle />;
  if (id.includes("scooter")) return <Scooter />;
  if (id.includes("sofa")) return <Sofa />;
  if (id.includes("dining_table")) return <DiningTable />;
  if (id.includes("refrigerator")) return <Appliance />;
  if (id.includes("washing_machine")) return <Appliance washer />;
  if (id.includes("street_lamp")) return <StreetLamp />;
  if (id.includes("street_tree")) return <Tree />;
  if (id.includes("trash_sorting")) return <TrashBins />;
  return <ExpandedLifeModel modelId={id} />;
}

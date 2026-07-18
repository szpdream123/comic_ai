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
      <meshStandardMaterial color={color} metalness={0.06} roughness={0.66} />
    </mesh>
  );
}

function CylinderPart({ color, position, rotation, scale }: PartProps) {
  return (
    <mesh castShadow receiveShadow position={position} rotation={rotation} scale={scale}>
      <cylinderGeometry args={[0.5, 0.5, 1, 18]} />
      <meshStandardMaterial color={color} metalness={0.12} roughness={0.58} />
    </mesh>
  );
}

function TorusPart({ color, position, rotation, scale }: PartProps) {
  return (
    <mesh castShadow receiveShadow position={position} rotation={rotation} scale={scale}>
      <torusGeometry args={[0.5, 0.1, 10, 26]} />
      <meshStandardMaterial color={color} metalness={0.12} roughness={0.58} />
    </mesh>
  );
}

function VehicleWheel({ x, z, radius = 0.23 }: { x: number; z: number; radius?: number }) {
  return (
    <CylinderPart
      color="#151b20"
      position={[x, radius, z]}
      rotation={[Math.PI / 2, 0, 0]}
      scale={[radius * 2, 0.14, radius * 2]}
    />
  );
}

function ServiceVehicle({
  accent,
  color,
  kind,
  roofLight = false,
}: {
  accent: string;
  color: string;
  kind: "sedan" | "box" | "van" | "pickup" | "fire";
  roofLight?: boolean;
}) {
  const longBody = kind === "box" || kind === "fire";
  const bodyLength = longBody ? 2.25 : kind === "van" ? 1.95 : 1.8;
  const bodyHeight = longBody ? 0.78 : kind === "van" ? 0.82 : 0.48;
  const bodyY = longBody || kind === "van" ? 0.7 : 0.5;
  const wheelX = longBody ? 0.82 : 0.66;

  return (
    <group>
      <BoxPart color={color} position={[0, bodyY, 0]} scale={[bodyLength, bodyHeight, 0.84]} />
      {kind === "pickup" ? (
        <>
          <BoxPart color={color} position={[0.47, 0.9, 0]} scale={[0.72, 0.56, 0.76]} />
          <BoxPart color="#333b40" position={[-0.55, 0.82, 0]} scale={[0.72, 0.2, 0.72]} />
        </>
      ) : kind === "sedan" ? (
        <BoxPart color={color} position={[0.08, 0.88, 0]} scale={[1.0, 0.36, 0.72]} />
      ) : (
        <BoxPart color={color} position={[-0.18, bodyY + bodyHeight * 0.52, 0]} scale={[bodyLength * 0.72, bodyHeight * 0.82, 0.78]} />
      )}
      <BoxPart color="#8eb6c7" position={[kind === "pickup" ? 0.48 : bodyLength * 0.27, bodyY + bodyHeight * 0.45, 0.43]} scale={[0.46, 0.34, 0.035]} />
      <BoxPart color={accent} position={[0, bodyY + 0.02, 0.43]} scale={[bodyLength * 0.82, 0.1, 0.04]} />
      {roofLight ? <BoxPart color={accent} position={[0.15, bodyY + bodyHeight + 0.23, 0]} scale={[0.42, 0.12, 0.26]} /> : null}
      <VehicleWheel x={-wheelX} z={-0.46} radius={longBody ? 0.26 : 0.23} />
      <VehicleWheel x={wheelX} z={-0.46} radius={longBody ? 0.26 : 0.23} />
      <VehicleWheel x={-wheelX} z={0.46} radius={longBody ? 0.26 : 0.23} />
      <VehicleWheel x={wheelX} z={0.46} radius={longBody ? 0.26 : 0.23} />
    </group>
  );
}

export const BUILTIN_SCENE_EXPANSION_MODEL_IDS = [
  "bed_double_low.fbx",
  "wardrobe_low.fbx",
  "bookshelf_low.fbx",
  "television_low.fbx",
  "coffee_table_low.fbx",
  "dining_chair_low.fbx",
  "toilet_low.fbx",
  "bathtub_low.fbx",
  "wall_panel_low.fbx",
  "wall_corner_low.fbx",
  "floor_slab_low.fbx",
  "roof_tile_low.fbx",
  "support_column_low.fbx",
  "elevator_door_low.fbx",
  "escalator_low.fbx",
  "roller_shutter_low.fbx",
  "traffic_light_low.fbx",
  "fire_hydrant_low.fbx",
  "traffic_cone_low.fbx",
  "road_guardrail_low.fbx",
  "road_sign_low.fbx",
  "phone_booth_low.fbx",
  "manhole_cover_low.fbx",
  "street_bollard_low.fbx",
  "motorcycle_low.fbx",
  "taxi_low.fbx",
  "delivery_truck_low.fbx",
  "ambulance_low.fbx",
  "police_car_low.fbx",
  "fire_engine_low.fbx",
  "passenger_van_low.fbx",
  "pickup_truck_low.fbx",
] as const;

const BUILTIN_SCENE_EXPANSION_MODEL_ID_SET = new Set<string>(BUILTIN_SCENE_EXPANSION_MODEL_IDS);

export function isBuiltInSceneExpansionModel(modelId: string) {
  return BUILTIN_SCENE_EXPANSION_MODEL_ID_SET.has(modelId.toLowerCase());
}

export function BuiltInSceneExpansionModel({ modelId }: { modelId: string }) {
  const id = modelId.toLowerCase();

  if (id.includes("bed_double")) return (
    <group name="builtin-double-bed">
      <BoxPart color="#76543d" position={[0, 0.35, 0]} scale={[1.85, 0.3, 2.1]} />
      <BoxPart color="#d8d8d1" position={[0, 0.58, 0]} scale={[1.72, 0.22, 1.94]} />
      <BoxPart color="#9a6b4b" position={[0, 1.02, -1.0]} scale={[1.9, 1.0, 0.16]} />
      {[-0.48, 0.48].map((x) => <BoxPart key={x} color="#f0eee7" position={[x, 0.76, -0.62]} scale={[0.7, 0.16, 0.48]} />)}
    </group>
  );
  if (id.includes("wardrobe")) return (
    <group name="builtin-wardrobe">
      <BoxPart color="#8b6849" position={[0, 1.05, 0]} scale={[1.5, 2.1, 0.72]} />
      <BoxPart color="#aa8460" position={[-0.37, 1.08, 0.38]} scale={[0.68, 1.92, 0.05]} />
      <BoxPart color="#aa8460" position={[0.37, 1.08, 0.38]} scale={[0.68, 1.92, 0.05]} />
      {[-0.08, 0.08].map((x) => <CylinderPart key={x} color="#d0b174" position={[x, 1.08, 0.44]} rotation={[Math.PI / 2, 0, 0]} scale={[0.08, 0.08, 0.08]} />)}
    </group>
  );
  if (id.includes("bookshelf")) return (
    <group name="builtin-bookshelf">
      <BoxPart color="#714f36" position={[0, 1.0, 0]} scale={[1.45, 2.0, 0.34]} />
      <BoxPart color="#2c3135" position={[0, 1.0, 0.2]} scale={[1.18, 1.75, 0.05]} />
      {[0.38, 0.82, 1.26, 1.7].map((y) => <BoxPart key={y} color="#8d6645" position={[0, y, 0.24]} scale={[1.3, 0.08, 0.36]} />)}
      {[-0.42, -0.12, 0.2, 0.45].map((x, index) => <BoxPart key={x} color={["#b45e50", "#d1a052", "#4f7893", "#659269"][index]!} position={[x, 1.48, 0.28]} scale={[0.16, 0.38, 0.18]} />)}
    </group>
  );
  if (id.includes("television")) return (
    <group name="builtin-television">
      <BoxPart color="#20272c" position={[0, 1.0, 0]} scale={[1.65, 0.95, 0.12]} />
      <BoxPart color="#53798e" position={[0, 1.0, 0.07]} scale={[1.48, 0.78, 0.04]} />
      <CylinderPart color="#505b61" position={[0, 0.42, 0]} scale={[0.12, 0.38, 0.12]} />
      <BoxPart color="#505b61" position={[0, 0.2, 0]} scale={[0.72, 0.08, 0.38]} />
    </group>
  );
  if (id.includes("coffee_table")) return (
    <group name="builtin-coffee-table">
      <BoxPart color="#9b7652" position={[0, 0.52, 0]} scale={[1.55, 0.14, 0.9]} />
      {[-0.58, 0.58].flatMap((x) => [-0.3, 0.3].map((z) => <BoxPart key={`${x}:${z}`} color="#624b39" position={[x, 0.25, z]} scale={[0.1, 0.5, 0.1]} />))}
    </group>
  );
  if (id.includes("dining_chair")) return (
    <group name="builtin-dining-chair">
      <BoxPart color="#8a603f" position={[0, 0.65, 0]} scale={[0.72, 0.14, 0.72]} />
      <BoxPart color="#8a603f" position={[0, 1.15, 0.29]} scale={[0.72, 0.78, 0.12]} />
      {[-0.26, 0.26].flatMap((x) => [-0.26, 0.26].map((z) => <BoxPart key={`${x}:${z}`} color="#63442f" position={[x, 0.3, z]} scale={[0.1, 0.6, 0.1]} />))}
    </group>
  );
  if (id.includes("toilet")) return (
    <group name="builtin-toilet">
      <CylinderPart color="#eceeea" position={[0, 0.42, 0.18]} scale={[0.82, 0.52, 1.05]} />
      <TorusPart color="#f6f7f3" position={[0, 0.67, 0.2]} rotation={[Math.PI / 2, 0, 0]} scale={[0.7, 0.92, 0.7]} />
      <BoxPart color="#eceeea" position={[0, 0.92, -0.35]} scale={[0.82, 0.85, 0.42]} />
    </group>
  );
  if (id.includes("bathtub")) return (
    <group name="builtin-bathtub">
      <BoxPart color="#e5ecec" position={[0, 0.42, 0]} scale={[1.85, 0.72, 0.98]} />
      <BoxPart color="#8eb7c3" position={[0, 0.65, 0]} scale={[1.55, 0.25, 0.7]} />
      <CylinderPart color="#8a979c" position={[-0.68, 0.92, -0.22]} scale={[0.08, 0.52, 0.08]} />
      <BoxPart color="#8a979c" position={[-0.48, 1.12, -0.22]} scale={[0.42, 0.08, 0.08]} />
    </group>
  );

  if (id.includes("wall_panel")) return <BoxPart color="#b8b1a7" position={[0, 1.25, 0]} scale={[2.4, 2.5, 0.18]} />;
  if (id.includes("wall_corner")) return (
    <group name="builtin-wall-corner">
      <BoxPart color="#b8b1a7" position={[0, 1.25, 0]} scale={[2.2, 2.5, 0.18]} />
      <BoxPart color="#a9a39a" position={[-1.0, 1.25, 1.0]} rotation={[0, Math.PI / 2, 0]} scale={[2.2, 2.5, 0.18]} />
    </group>
  );
  if (id.includes("floor_slab")) return <BoxPart color="#777d81" position={[0, 0.08, 0]} scale={[2.5, 0.16, 2.5]} />;
  if (id.includes("roof_tile")) return (
    <group name="builtin-roof-module">
      <BoxPart color="#874b3d" position={[-0.58, 0.58, 0]} rotation={[0, 0, -0.6]} scale={[1.55, 0.14, 2.2]} />
      <BoxPart color="#874b3d" position={[0.58, 0.58, 0]} rotation={[0, 0, 0.6]} scale={[1.55, 0.14, 2.2]} />
    </group>
  );
  if (id.includes("support_column")) return (
    <group name="builtin-support-column">
      <CylinderPart color="#aaaeb0" position={[0, 1.25, 0]} scale={[0.5, 2.5, 0.5]} />
      <CylinderPart color="#8e9396" position={[0, 0.1, 0]} scale={[0.78, 0.2, 0.78]} />
      <CylinderPart color="#8e9396" position={[0, 2.42, 0]} scale={[0.7, 0.18, 0.7]} />
    </group>
  );
  if (id.includes("elevator_door")) return (
    <group name="builtin-elevator-door">
      <BoxPart color="#5d686e" position={[0, 1.25, 0]} scale={[1.8, 2.5, 0.18]} />
      <BoxPart color="#aeb7ba" position={[-0.43, 1.25, 0.12]} scale={[0.82, 2.22, 0.06]} />
      <BoxPart color="#aeb7ba" position={[0.43, 1.25, 0.12]} scale={[0.82, 2.22, 0.06]} />
      <BoxPart color="#d6b85d" position={[1.08, 1.15, 0.14]} scale={[0.18, 0.35, 0.08]} />
    </group>
  );
  if (id.includes("escalator")) return (
    <group name="builtin-escalator">
      {Array.from({ length: 8 }, (_, index) => <BoxPart key={index} color="#7b858b" position={[0, 0.12 + index * 0.16, -0.84 + index * 0.24]} scale={[1.05, 0.18, 0.48]} />)}
      {[-0.62, 0.62].map((x) => <BoxPart key={x} color="#424c52" position={[x, 0.78, 0]} rotation={[0.76, 0, 0]} scale={[0.08, 0.08, 2.5]} />)}
    </group>
  );
  if (id.includes("roller_shutter")) return (
    <group name="builtin-roller-shutter">
      {Array.from({ length: 11 }, (_, index) => <BoxPart key={index} color={index % 2 ? "#8d969a" : "#9fa7aa"} position={[0, 0.22 + index * 0.2, 0]} scale={[1.9, 0.18, 0.1]} />)}
      <BoxPart color="#59636a" position={[0, 2.42, 0]} scale={[2.12, 0.28, 0.28]} />
    </group>
  );

  if (id.includes("traffic_light")) return (
    <group name="builtin-traffic-light">
      <CylinderPart color="#465158" position={[0, 1.1, 0]} scale={[0.12, 2.2, 0.12]} />
      <BoxPart color="#252d32" position={[0, 2.05, 0]} scale={[0.48, 0.92, 0.35]} />
      {["#df5450", "#e5b748", "#53a968"].map((color, index) => <CylinderPart key={color} color={color} position={[0, 2.35 - index * 0.3, 0.2]} rotation={[Math.PI / 2, 0, 0]} scale={[0.18, 0.08, 0.18]} />)}
    </group>
  );
  if (id.includes("fire_hydrant")) return (
    <group name="builtin-fire-hydrant">
      <CylinderPart color="#c94b43" position={[0, 0.5, 0]} scale={[0.5, 0.9, 0.5]} />
      <CylinderPart color="#d45a50" position={[0, 0.96, 0]} scale={[0.68, 0.18, 0.68]} />
      <CylinderPart color="#c94b43" position={[0, 1.12, 0]} scale={[0.4, 0.28, 0.4]} />
      {[-0.38, 0.38].map((x) => <CylinderPart key={x} color="#b43e38" position={[x, 0.62, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.25, 0.42, 0.25]} />)}
    </group>
  );
  if (id.includes("traffic_cone")) return (
    <group name="builtin-traffic-cone">
      <BoxPart color="#30383d" position={[0, 0.06, 0]} scale={[0.75, 0.12, 0.75]} />
      <mesh castShadow receiveShadow position={[0, 0.48, 0]}><coneGeometry args={[0.28, 0.85, 18]} /><meshStandardMaterial color="#ee7b32" roughness={0.62} /></mesh>
      <CylinderPart color="#e8e5db" position={[0, 0.42, 0]} scale={[0.52, 0.12, 0.52]} />
    </group>
  );
  if (id.includes("road_guardrail")) return (
    <group name="builtin-road-guardrail">
      <BoxPart color="#a8b0b4" position={[0, 0.62, 0]} scale={[2.4, 0.18, 0.18]} />
      {[-0.92, 0, 0.92].map((x) => <BoxPart key={x} color="#6e787d" position={[x, 0.34, 0]} scale={[0.12, 0.68, 0.12]} />)}
    </group>
  );
  if (id.includes("road_sign")) return (
    <group name="builtin-road-sign">
      <CylinderPart color="#68747a" position={[0, 0.85, 0]} scale={[0.1, 1.7, 0.1]} />
      <CylinderPart color="#d9dfe0" position={[0, 1.72, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.82, 0.08, 0.82]} />
      <CylinderPart color="#4a87b2" position={[0, 1.72, 0.05]} rotation={[Math.PI / 2, 0, 0]} scale={[0.68, 0.05, 0.68]} />
    </group>
  );
  if (id.includes("phone_booth")) return (
    <group name="builtin-phone-booth">
      <BoxPart color="#bd443e" position={[0, 1.15, 0]} scale={[1.0, 2.3, 0.86]} />
      <BoxPart color="#5d8ea5" position={[0, 1.25, 0.46]} scale={[0.72, 1.55, 0.05]} />
      <BoxPart color="#f0e5d1" position={[0, 2.12, 0.46]} scale={[0.72, 0.28, 0.05]} />
      <BoxPart color="#2b3439" position={[0.18, 1.2, 0.52]} scale={[0.18, 0.55, 0.1]} />
    </group>
  );
  if (id.includes("manhole_cover")) return (
    <group name="builtin-manhole-cover">
      <CylinderPart color="#4e565a" position={[0, 0.04, 0]} scale={[1.2, 0.08, 1.2]} />
      <TorusPart color="#737b7e" position={[0, 0.09, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.9, 0.9, 0.9]} />
    </group>
  );
  if (id.includes("street_bollard")) return (
    <group name="builtin-street-bollard">
      <CylinderPart color="#4a555b" position={[0, 0.48, 0]} scale={[0.34, 0.9, 0.34]} />
      <CylinderPart color="#e6c94c" position={[0, 0.68, 0]} scale={[0.38, 0.14, 0.38]} />
      <CylinderPart color="#30383d" position={[0, 0.06, 0]} scale={[0.62, 0.12, 0.62]} />
    </group>
  );

  if (id.includes("motorcycle")) return (
    <group name="builtin-motorcycle">
      {[-0.65, 0.65].map((x) => <TorusPart key={x} color="#182026" position={[x, 0.42, 0]} scale={[0.7, 0.7, 0.7]} />)}
      <BoxPart color="#b94742" position={[0, 0.72, 0]} rotation={[0, 0, -0.12]} scale={[0.9, 0.28, 0.34]} />
      <CylinderPart color="#59656b" position={[0.48, 0.84, 0]} rotation={[0, 0, -0.28]} scale={[0.1, 0.9, 0.1]} />
      <BoxPart color="#252d32" position={[-0.3, 0.94, 0]} scale={[0.52, 0.15, 0.34]} />
      <BoxPart color="#59656b" position={[0.62, 1.18, 0]} scale={[0.45, 0.07, 0.07]} />
    </group>
  );
  if (id.includes("taxi")) return <ServiceVehicle accent="#20272b" color="#e1b63e" kind="sedan" />;
  if (id.includes("delivery_truck")) return <ServiceVehicle accent="#5d8da5" color="#e3e6e5" kind="box" />;
  if (id.includes("ambulance")) return <ServiceVehicle accent="#d34b47" color="#ecefec" kind="van" roofLight />;
  if (id.includes("police_car")) return <ServiceVehicle accent="#3f75ad" color="#e7e9e7" kind="sedan" roofLight />;
  if (id.includes("fire_engine")) return <ServiceVehicle accent="#f0c34d" color="#c9443e" kind="fire" roofLight />;
  if (id.includes("passenger_van")) return <ServiceVehicle accent="#566c78" color="#cbd3d5" kind="van" />;
  if (id.includes("pickup_truck")) return <ServiceVehicle accent="#3d4b52" color="#567b68" kind="pickup" />;

  return null;
}

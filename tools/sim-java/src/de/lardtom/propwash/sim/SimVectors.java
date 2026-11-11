// Test vectors of the flight model for tools/test-sim-model.mjs, computed with the classes of the Propwash release jar
// (run by tools/build-sim-vectors.mjs, which writes the spec and reads the result):
//
//   java -cp <stand-ins>:<release jar>:<joml, gson, jspecify, slf4j> de.lardtom.propwash.sim.SimVectors spec.json out.json golden.txt
//
// - constants of DroneSim/FlightController that come from Math.cos/Math.exp at class load;
// - the built-in parts in the order of their types' values() and the names of the chemistries (for the golden test);
// - the AirframeGoldenTest of the mod run again with these classes (proves the two Minecraft stand-ins change nothing);
// - every field of AirframeSpec for the builds of the spec, creative drones with the parts of their flight build
//   (webexport.PartData, the data the configurator's catalog carries) and the inertia override;
// - flights: DroneSim stepped frame by frame in a box world by the loop of assets/js/sim/flight.js (ported here line by
//   line: environment and support grid, frame slicing, block clipping, surfaces, depenetration), with the state of
//   every frame hashed and written in full once a second.
//
// It sits in the package de.lardtom.propwash.sim to read the package-private state (body, power, thermal, fc, …).
package de.lardtom.propwash.sim;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import de.lardtom.propwash.api.part.PartDefinition;
import de.lardtom.propwash.api.part.PartKind;
import de.lardtom.propwash.build.AccessoryType;
import de.lardtom.propwash.build.Accessories;
import de.lardtom.propwash.build.BatteryType;
import de.lardtom.propwash.build.DroneBuild;
import de.lardtom.propwash.build.FrameType;
import de.lardtom.propwash.build.MotorType;
import de.lardtom.propwash.build.PartIndex;
import de.lardtom.propwash.build.PartInfo;
import de.lardtom.propwash.build.PropType;
import de.lardtom.propwash.build.StackType;
import de.lardtom.propwash.build.VideoType;
import de.lardtom.propwash.creative.CreativeSpec;
import de.lardtom.propwash.webexport.PartData;
import net.minecraft.resources.Identifier;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

public final class SimVectors {
    private static final Gson GSON = new GsonBuilder().disableHtmlEscaping().create();
    private static final String[] SLOTS = {"top", "bottom", "front"};

    private SimVectors() {
    }

    public static void main(String[] args) throws Exception {
        JsonObject spec = JsonParser.parseString(Files.readString(Path.of(args[0]))).getAsJsonObject();
        JsonObject out = new JsonObject();
        out.add("constants", constants());
        out.add("pow", powTable());
        out.add("builtins", builtins());
        out.add("golden", golden(Path.of(args[2])));
        Map<String, AirframeSpec> specs = new LinkedHashMap<>();
        JsonArray airframes = new JsonArray();
        for (JsonElement e : spec.getAsJsonArray("airframes")) {
            JsonObject a = e.getAsJsonObject();
            DroneBuild build = build(a.getAsJsonObject("build"));
            if (a.has("creative")) {
                build = build.withCreative(creative(a.getAsJsonObject("creative")));
            }
            AirframeSpec p = AirframeSpec.of(build);
            specs.put(a.get("name").getAsString(), p);
            JsonObject dump = new JsonObject();
            dump.addProperty("name", a.get("name").getAsString());
            dump.add("fields", fields(p));
            if (build.edited()) {
                dump.add("flight", flight(build));
            }
            airframes.add(dump);
        }
        out.add("airframes", airframes);
        JsonArray flights = new JsonArray();
        for (JsonElement e : spec.getAsJsonArray("flights")) {
            JsonObject f = e.getAsJsonObject();
            flights.add(fly(f, specs.get(f.get("airframe").getAsString())));
        }
        out.add("flights", flights);
        Files.writeString(Path.of(args[1]), GSON.toJson(out), StandardCharsets.UTF_8);
    }

    // ------------------------------------------------------------------------------------------------------------
    // Values

    static String hex(double v) {
        return Long.toHexString(Double.doubleToRawLongBits(v));
    }

    private static JsonObject constants() {
        JsonObject c = new JsonObject();
        c.addProperty("FlightController.KNOCKED_UP", hex(FlightController.KNOCKED_UP));
        c.addProperty("FlightController.LYING_UP", hex(FlightController.LYING_UP));
        c.addProperty("DroneSim.STICKY_STEP", hex(DroneSim.STICKY_STEP));
        c.addProperty("DroneSim.PROP_CONTACT_ON", hex(DroneSim.PROP_CONTACT_ON));
        c.addProperty("DroneSim.PROP_CONTACT_OFF", hex(DroneSim.PROP_CONTACT_OFF));
        return c;
    }

    /** StrictMath.pow of the derivation of the built-in parts: prop diameter^4 and ^5 (rotor constants), motor size factor. */
    private static JsonArray powTable() {
        JsonArray out = new JsonArray();
        for (PropType prop : builtinsOf(PropType.values())) {
            double d = prop.diameterMeters();
            for (double n : new double[]{4.0, 5.0}) {
                JsonArray e = new JsonArray();
                e.add(hex(d));
                e.add(hex(n));
                e.add(hex(StrictMath.pow(d, n)));
                out.add(e);
            }
        }
        for (MotorType motor : builtinsOf(MotorType.values())) {
            double x = motor.massGrams() / 33.0;
            JsonArray e = new JsonArray();
            e.add(hex(x));
            e.add(hex(2.0 / 3.0));
            e.add(hex(StrictMath.pow(x, 2.0 / 3.0)));
            out.add(e);
        }
        return out;
    }

    private static <T extends PartInfo> List<T> builtinsOf(T[] values) {
        List<T> out = new ArrayList<>();
        for (T value : values) {
            if (value.builtin() && !(value instanceof StackType stack && stack.creative())) {
                out.add(value);
            }
        }
        return out;
    }

    private static JsonArray ids(List<? extends PartInfo> parts) {
        JsonArray a = new JsonArray();
        for (PartInfo p : parts) {
            a.add(p.id().toString());
        }
        return a;
    }

    private static JsonObject builtins() {
        JsonObject b = new JsonObject();
        b.add("frame", ids(builtinsOf(FrameType.values())));
        b.add("stack", ids(builtinsOf(StackType.values())));
        b.add("motor", ids(builtinsOf(MotorType.values())));
        b.add("prop", ids(builtinsOf(PropType.values())));
        b.add("video", ids(builtinsOf(VideoType.values())));
        b.add("battery", ids(builtinsOf(BatteryType.values())));
        JsonObject chemistry = new JsonObject();
        for (BatteryType.Chemistry c : BatteryType.Chemistry.values()) {
            chemistry.addProperty(c.id().toString(), c.name());
        }
        b.add("chemistry", chemistry);
        JsonArray presets = new JsonArray();
        for (DroneBuild preset : goldenPresets()) {
            presets.add(buildJson(preset));
        }
        b.add("presets", presets);
        return b;
    }

    // ------------------------------------------------------------------------------------------------------------
    // AirframeGoldenTest (common/src/test/…/sim/AirframeGoldenTest.java of the mod), again with the jar's classes

    private static final List<String> GOLDEN_FIELDS = List.of("buildKey", "buildable", "massKg", "armLength", "motorOffset",
            "propDiameter", "propRadius", "discArea", "propPitch", "ducted", "comHeight", "rotorPlaneOffset", "inertiaXx", "inertiaYy",
            "inertiaZz", "kv", "kt", "motorResistance", "escResistance", "phaseResistance", "idleCurrent", "escCurrentLimit",
            "escInputLimit", "rotorInertia", "rotorInertiaEff", "omegaMax", "hoverOmega", "motorTauPhys", "motorTau", "kThrust",
            "kTorque", "ductGain", "zeroThrustPerOmega", "translationalLiftGain", "hoverInducedVelocity", "washNoiseHz", "cells",
            "capacityMah", "chemistry", "packResistance", "polarizationResistance", "continuousCurrent", "fullPackVoltage",
            "auxPower", "accessoryPower", "accessoryMassKg", "brownoutVoltage", "areaX", "areaY", "areaZ", "dragCoefficient",
            "rotationalDamping", "impactTolerance", "restitution", "friction", "hitboxWidth", "hitboxHeight", "hitboxFootOffset",
            "authorityRoll", "authorityPitch", "authorityYawSteady", "authorityYawInstant", "hoverVoltage", "lensRight", "lensUp",
            "lensForward", "washLoss", "washNoise", "motorMassKg", "stackMassKg", "motorX", "motorY", "motorZ", "spin", "hullX",
            "hullY", "hullZ");

    static List<DroneBuild> goldenPresets() {
        List<DroneBuild> out = new ArrayList<>();
        for (DroneBuild preset : DroneBuild.PRESETS) {
            out.add(preset == DroneBuild.RACER ? DroneBuild.RACER.withProp(PropType.P51_3B) : preset);
        }
        out.add(DroneBuild.RACER);
        return out;
    }

    private static void goldenDump(StringBuilder out, AirframeSpec spec) throws ReflectiveOperationException {
        for (String name : GOLDEN_FIELDS) {
            Field field = AirframeSpec.class.getDeclaredField(name);
            field.setAccessible(true);
            Object value = field.get(spec);
            out.append(name).append('=');
            switch (value) {
                case Double d -> out.append(hex(d));
                case double[] array -> {
                    for (double d : array) {
                        out.append(hex(d)).append(',');
                    }
                }
                case int[] array -> out.append(Arrays.toString(array));
                case BatteryType.Chemistry chemistry -> out.append(chemistry.name());
                default -> out.append(value);
            }
            out.append(';');
        }
        out.append('\n');
    }

    private static String sha24(CharSequence text) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        return HexFormat.of().formatHex(digest.digest(text.toString().getBytes(StandardCharsets.UTF_8))).substring(0, 24);
    }

    private static JsonObject golden(Path file) throws Exception {
        Map<String, String> expected = new LinkedHashMap<>();
        for (String line : Files.readAllLines(file, StandardCharsets.UTF_8)) {
            if (!line.isBlank()) {
                String[] parts = line.trim().split("\\s+");
                expected.put(parts[0], parts[1]);
            }
        }
        Map<String, String> actual = new LinkedHashMap<>();
        for (FrameType frame : builtinsOf(FrameType.values())) {
            for (MotorType motor : builtinsOf(MotorType.values())) {
                for (PropType prop : builtinsOf(PropType.values())) {
                    StringBuilder dump = new StringBuilder();
                    for (StackType stack : builtinsOf(StackType.values())) {
                        for (VideoType video : builtinsOf(VideoType.values())) {
                            for (BatteryType battery : builtinsOf(BatteryType.values())) {
                                goldenDump(dump, AirframeSpec.of(new DroneBuild(frame, stack, motor, prop, video, battery)));
                            }
                        }
                    }
                    actual.put(frame.key() + "/" + motor.key() + "/" + prop.key(), sha24(dump));
                }
            }
        }
        String analysisSkipped = null;
        try {
            for (DroneBuild preset : goldenPresets()) {
                for (DroneBuild build : List.of(preset, preset.withAccessory(AccessoryType.LED_STRIP),
                        preset.withAccessory(AccessoryType.ACTION_CAM_HEAVY),
                        preset.withAccessory(AccessoryType.ACTION_CAM_LIGHT).withAccessory(AccessoryType.LED_STRIP))) {
                    if (!build.buildable() && build != preset) {
                        continue;
                    }
                    StringBuilder dump = new StringBuilder();
                    goldenDump(dump, AirframeSpec.of(build));
                    BuildAnalysis a = BuildAnalysis.of(build);
                    for (double v : new double[]{a.massGrams(), a.thrustToWeight(), a.maxThrustPerMotorGrams(), a.hoverThrottlePercent(),
                            a.hoverCurrentA(), a.hoverFlightTimeMin(), a.cruiseFlightTimeMin(), a.fullThrottleCurrentA(),
                            a.fullThrottleCellVoltage(), a.escLoadPercent(), a.batteryLoadPercent(), a.topSpeedAcroKmh(),
                            a.topSpeedAngleKmh(), a.motorResponseMs(), a.rollAccelDps2(), a.crashSpeedMs()}) {
                        dump.append(hex(v)).append(',');
                    }
                    TreeSet<String> warnings = new TreeSet<>();
                    a.warnings().forEach(w -> warnings.add(w.name()));
                    dump.append(warnings).append(build.problems()).append(build.warnings());
                    actual.put("analysis:" + AirframeSpec.of(build).buildKey, sha24(dump));
                }
            }
        } catch (LinkageError e) {
            analysisSkipped = e.toString();
        }
        JsonObject g = new JsonObject();
        int matched = 0;
        JsonArray differ = new JsonArray();
        for (Map.Entry<String, String> entry : expected.entrySet()) {
            String got = actual.get(entry.getKey());
            if (entry.getValue().equals(got)) {
                matched++;
            } else if (got != null) {
                differ.add(entry.getKey());
            }
        }
        g.addProperty("expected", expected.size());
        g.addProperty("computed", actual.size());
        g.addProperty("matched", matched);
        g.add("differ", differ);
        if (analysisSkipped != null) {
            g.addProperty("analysisSkipped", analysisSkipped);
        }
        return g;
    }

    // ------------------------------------------------------------------------------------------------------------
    // Builds, airframe fields, creative flight builds

    private static <T extends PartInfo> T part(Class<T> type, String id) {
        return PartIndex.byId(type, Identifier.parse(id)).orElseThrow(() -> new IllegalArgumentException("unknown part " + id));
    }

    static DroneBuild build(JsonObject b) {
        DroneBuild build = new DroneBuild(part(FrameType.class, b.get("frame").getAsString()), part(StackType.class, b.get("stack").getAsString()),
                part(MotorType.class, b.get("motor").getAsString()), part(PropType.class, b.get("prop").getAsString()),
                part(VideoType.class, b.get("video").getAsString()), part(BatteryType.class, b.get("battery").getAsString()));
        JsonObject accessories = b.has("accessories") ? b.getAsJsonObject("accessories") : new JsonObject();
        for (String slot : SLOTS) {
            if (accessories.has(slot)) {
                build = build.withAccessory(part(AccessoryType.class, accessories.get(slot).getAsString()));
            }
        }
        return build;
    }

    static JsonObject buildJson(DroneBuild b) {
        JsonObject o = new JsonObject();
        o.addProperty("frame", b.frame().id().toString());
        o.addProperty("stack", b.stack().id().toString());
        o.addProperty("motor", b.motor().id().toString());
        o.addProperty("prop", b.prop().id().toString());
        o.addProperty("video", b.video().id().toString());
        o.addProperty("battery", b.battery().id().toString());
        JsonObject acc = new JsonObject();
        for (AccessoryType type : b.accessories().list()) {
            acc.addProperty(type.mount.key(), type.id().toString());
        }
        o.add("accessories", acc);
        return o;
    }

    static CreativeSpec creative(JsonObject c) {
        Map<PartKind, String> base = new EnumMap<>(PartKind.class);
        if (c.has("base")) {
            for (Map.Entry<String, JsonElement> e : c.getAsJsonObject("base").entrySet()) {
                base.put(PartKind.valueOf(e.getKey().toUpperCase(java.util.Locale.ROOT)), e.getValue().getAsString());
            }
        }
        Map<String, Double> values = new LinkedHashMap<>();
        for (Map.Entry<String, JsonElement> e : c.getAsJsonObject("values").entrySet()) {
            values.put(e.getKey(), e.getValue().getAsDouble());
        }
        return new CreativeSpec(base, values);
    }

    static JsonObject fields(AirframeSpec p) throws ReflectiveOperationException {
        JsonObject o = new JsonObject();
        for (Field field : AirframeSpec.class.getDeclaredFields()) {
            if (Modifier.isStatic(field.getModifiers()) || field.getName().equals("build")) {
                continue;
            }
            field.setAccessible(true);
            Object value = field.get(p);
            switch (value) {
                case Double d -> o.addProperty(field.getName(), hex(d));
                case Integer i -> o.addProperty(field.getName(), i);
                case Boolean b -> o.addProperty(field.getName(), b);
                case String s -> o.addProperty(field.getName(), s);
                case double[] array -> {
                    JsonArray a = new JsonArray();
                    for (double d : array) {
                        a.add(hex(d));
                    }
                    o.add(field.getName(), a);
                }
                case int[] array -> {
                    JsonArray a = new JsonArray();
                    for (int i : array) {
                        a.add(i);
                    }
                    o.add(field.getName(), a);
                }
                case BatteryType.Chemistry c -> o.addProperty(field.getName(), c.id().toString());
                case Enum<?> e -> o.addProperty(field.getName(), e.name());
                case null -> o.add(field.getName(), null);
                default -> throw new IllegalStateException("field " + field.getName() + " of type " + value.getClass());
            }
        }
        return o;
    }

    private static JsonObject export(PartInfo part, String category) {
        PartDefinition def = part.definition();
        JsonObject o = new JsonObject();
        o.addProperty("id", part.id().toString());
        o.addProperty("category", category);
        o.add("basics", PartData.basics(def.basics()));
        o.add("data", PartData.data(def));
        o.add("derived", PartData.derived(def));
        return o;
    }

    static JsonObject flight(DroneBuild build) {
        DroneBuild f = build.flight();
        JsonObject o = new JsonObject();
        o.add("build", buildJson(f));
        JsonArray parts = new JsonArray();
        parts.add(export(f.frame(), "frame"));
        parts.add(export(f.stack(), "stack"));
        parts.add(export(f.motor(), "motor"));
        parts.add(export(f.prop(), "prop"));
        parts.add(export(f.video(), "video"));
        parts.add(export(f.battery(), "battery"));
        for (AccessoryType type : f.accessories().list()) {
            parts.add(export(type, "accessory"));
        }
        o.add("parts", parts);
        double[] inertia = build.inertiaOverride();
        if (inertia != null) {
            JsonArray a = new JsonArray();
            for (double v : inertia) {
                a.add(hex(v));
            }
            o.add("inertia", a);
        }
        o.addProperty("hash", PartIndex.hashOf(build.creative()));
        return o;
    }

    // ------------------------------------------------------------------------------------------------------------
    // Flights

    /** A box world on a grid of cells (the voxel world of assets/js/sim/world.js, reduced to boxes of cells). */
    static final class BoxWorld {
        final double cell;
        final double[] origin = new double[3];
        final int[][] boxes;

        BoxWorld(JsonObject w) {
            this.cell = w.get("cell").getAsDouble();
            JsonArray o = w.getAsJsonArray("origin");
            for (int a = 0; a < 3; a++) {
                this.origin[a] = o.get(a).getAsDouble();
            }
            JsonArray b = w.getAsJsonArray("boxes");
            this.boxes = new int[b.size()][6];
            for (int i = 0; i < b.size(); i++) {
                for (int k = 0; k < 6; k++) {
                    this.boxes[i][k] = b.get(i).getAsJsonArray().get(k).getAsInt();
                }
            }
        }

        boolean solid(int i, int j, int k) {
            if (j < 0) {
                return true;
            }
            for (int[] b : this.boxes) {
                if (i >= b[0] && i <= b[3] && j >= b[1] && j <= b[4] && k >= b[2] && k <= b[5]) {
                    return true;
                }
            }
            return false;
        }

        int cellOf(int axis, double v) {
            return (int) Math.floor((v - this.origin[axis]) / this.cell);
        }

        double groundDistance(double x, double y, double z, double range) {
            int i = this.cellOf(0, x);
            int k = this.cellOf(2, z);
            int top = this.cellOf(1, y);
            int end = this.cellOf(1, y - range);
            for (int j = top; j >= end; j--) {
                if (this.solid(i, j, k)) {
                    double d = y - (this.origin[1] + (j + 1) * this.cell);
                    return d <= range ? Math.max(0.0, d) : Double.POSITIVE_INFINITY;
                }
            }
            return Double.POSITIVE_INFINITY;
        }
    }

    /** assets/js/sim/flight.js (class Flight), line by line. */
    static final class Pilot {
        static final double EPS = 1e-7;
        static final double SLICE_DISTANCE = 0.5;
        static final int MAX_SLICES = 4;
        static final double GROUND_PROBE = 5.0;
        static final double SOLID_PROBE = 1.0;
        static final double HIT_EPSILON = 1.0e-7;
        static final double SUPPORT_PROBE = 0.05;
        static final double MAX_FRAME_SECONDS = 0.05;
        static final double SUPPORT_START = 0.01;
        static final int TALL_SHAPE_REACH = 1;
        static final double CLIP_INSIDE = 0.001;
        static final double BELOW_REACH = 1.0;
        static final double FACE_REACH = 0.25;
        static final double INSIDE = 1.0e-3;
        static final double EDGE = 1.0e-7;
        static final double OBLIQUE_AXIS = 0.35;
        static final SurfaceResponse CONCRETE = SurfaceResponse.normal(0.6F);
        static final double DEPEN_TOLERANCE = 1.0e-3;
        static final double DEPEN_REACH = 1.5;
        static final double DEPEN_CLEARANCE = 1.0e-4;
        static final int DEPEN_MAX_CELLS = 4096;
        static final double DEPEN_TIE = 1.0e-6;
        static final double[][] DIRECTIONS = {{0.0, 1.0, 0.0}, {1.0, 0.0, 0.0}, {-1.0, 0.0, 0.0}, {0.0, 0.0, 1.0}, {0.0, 0.0, -1.0},
                {0.0, -1.0, 0.0}};

        final DroneSim sim;
        final BoxWorld world;
        final PilotInput input = new PilotInput();
        final SimEnvironment env = new SimEnvironment();
        final StepResult result = new StepResult();
        final MoveReport report = new MoveReport();
        final double halfWidth;
        final double height;
        final double foot;
        final double[] min = new double[3];
        final double[] max = new double[3];
        final int[] cell = new int[3];
        double x;
        double y;
        double z;
        double time;
        double[] wind;
        double ambientTempC = 20.0;
        final SurfaceResponse.Mix mix = new SurfaceResponse.Mix();
        final List<String> events = new ArrayList<>();

        Pilot(DroneSim sim, BoxWorld world) {
            this.sim = sim;
            this.world = world;
            this.input.mode = StabMode.ACRO;
            this.input.linkOk = true;
            AirframeSpec p = sim.params();
            this.halfWidth = 0.5 * p.hitboxWidth;
            this.height = p.hitboxHeight;
            this.foot = p.hitboxFootOffset;
        }

        void place(double bottomX, double bottomY, double bottomZ, double headingRad) {
            this.x = bottomX;
            this.y = bottomY - this.foot;
            this.z = bottomZ;
            this.sim.reset(this.x, this.y, this.z, headingRad);
            this.sim.requireArmSwitchReset();
        }

        void frame(double seconds) {
            DroneSim sim = this.sim;
            double dt = Math.max(0.0, Math.min(MAX_FRAME_SECONDS, seconds));
            this.time += dt;
            this.fillEnvironment();
            double speed = sim.telemetry().speed;
            int slices = Double.isFinite(speed) ? (int) Math.max(1.0, Math.min(MAX_SLICES, Math.ceil(speed * dt / SLICE_DISTANCE))) : 1;
            this.events.clear();
            double remaining = dt;
            for (int i = 0; i < slices; i++) {
                double part = i == slices - 1 ? remaining : dt / slices;
                remaining -= part;
                sim.step(part, this.input, this.env, this.result);
                this.move(this.result.dx, this.result.dy, this.result.dz);
                EventQueue q = sim.events();
                for (int k = 0; k < q.size(); k++) {
                    this.events.add(q.type(k).name() + "@" + hex(q.time(k)) + "," + hex(q.value(k)) + "," + q.motor(k));
                }
            }
        }

        void fillEnvironment() {
            SimEnvironment env = this.env;
            double x = this.x;
            double y = this.y;
            double z = this.z;
            env.groundDistance = this.world.groundDistance(x, y, z, GROUND_PROBE);
            env.solidDistance = env.groundDistance < SOLID_PROBE ? this.world.groundDistance(x, y, z, SOLID_PROBE) : Double.POSITIVE_INFINITY;
            env.airDensity = 1.225;
            env.ambientTempC = this.ambientTempC;
            env.skyView = 1.0;
            if (this.wind != null) {
                env.windX = this.wind[0];
                env.windY = this.wind[1];
                env.windZ = this.wind[2];
                env.gustIntensity = this.wind[3];
            } else {
                env.windX = 0.0;
                env.windY = 0.0;
                env.windZ = 0.0;
                env.gustIntensity = 0.0;
            }
            boolean near = env.groundDistance < SOLID_PROBE || this.sim.telemetry().grounded;
            if (near) {
                this.fillSupport(x, y + this.foot, z, 2.0 * this.halfWidth, env);
                this.fillPoints(x, y + this.foot, z, env);
            } else {
                env.clearSupport();
            }
        }

        void fillSupport(double x, double bottom, double z, double width, SimEnvironment env) {
            int side = SimEnvironment.SUPPORT_SIDE;
            double spacing = SimEnvironment.supportSpacing(width);
            double start = bottom + SUPPORT_START;
            double range = SimEnvironment.SUPPORT_RANGE;
            env.supportSpacing = spacing;
            env.supportX = x;
            env.supportZ = z;
            for (int iz = 0; iz < side; iz++) {
                for (int ix = 0; ix < side; ix++) {
                    double cx = x + SimEnvironment.supportOffset(ix, spacing);
                    double cz = z + SimEnvironment.supportOffset(iz, spacing);
                    env.support[SimEnvironment.supportCell(ix, iz)] = this.blockTop(cx, start, cz, range);
                }
            }
        }

        void fillPoints(double x, double bottom, double z, SimEnvironment env) {
            AirframeSpec p = this.sim.params();
            int count = Math.min(p.standPointCount(), SimEnvironment.POINT_SUPPORT);
            env.pointCount = 0;
            if (count <= 0 || !(env.supportSpacing > 0.0)) {
                return;
            }
            RigidBody b = this.sim.body;
            double start = bottom + SUPPORT_START;
            double range = SimEnvironment.SUPPORT_RANGE;
            for (int j = 0; j < count; j++) {
                int k = AirframeSpec.ACCESSORY_GROUND + j;
                double gx = p.groundX(k);
                double gy = p.groundY(k);
                double gz = p.groundZ(k);
                env.pointX[j] = x + (b.r00 * gx + b.r01 * gy + b.r02 * gz);
                env.pointZ[j] = z + (b.r20 * gx + b.r21 * gy + b.r22 * gz);
            }
            for (int j = 0; j < count; j++) {
                env.pointSupport[j] = this.blockTop(env.pointX[j], start, env.pointZ[j], range);
            }
            env.pointCount = count;
        }

        double blockTop(double x, double start, double z, double range) {
            BoxWorld w = this.world;
            double c = w.cell;
            int i = w.cellOf(0, x);
            int k = w.cellOf(2, z);
            double inside = start - CLIP_INSIDE * range;
            int lowest = w.cellOf(1, start - range) - TALL_SHAPE_REACH;
            double best = Double.NEGATIVE_INFINITY;
            for (int j = w.cellOf(1, start); j >= lowest; j--) {
                if (!w.solid(i, j, k)) {
                    continue;
                }
                double floor = w.origin[1] + j * c;
                double top = floor + c;
                if (inside >= floor && inside < top) {
                    return Double.NaN;
                }
                if (top <= start && top >= start - range) {
                    best = Math.max(best, top);
                }
            }
            return best;
        }

        void move(double dx, double dy, double dz) {
            if (!Double.isFinite(dx) || !Double.isFinite(dy) || !Double.isFinite(dz)) {
                dx = 0.0;
                dy = 0.0;
                dz = 0.0;
            }
            this.escape();
            this.updateBox();
            double ay = this.clip(1, dy);
            this.y += ay;
            this.updateBox();
            double ax;
            double az;
            if (Math.abs(dx) >= Math.abs(dz)) {
                ax = this.clip(0, dx);
                this.x += ax;
                this.updateBox();
                az = this.clip(2, dz);
                this.z += az;
            } else {
                az = this.clip(2, dz);
                this.z += az;
                this.updateBox();
                ax = this.clip(0, dx);
                this.x += ax;
            }
            MoveReport r = this.report;
            r.clear();
            r.requestedX = dx;
            r.requestedY = dy;
            r.requestedZ = dz;
            r.actualX = ax;
            r.actualY = ay;
            r.actualZ = az;
            r.hitX = Math.abs(ax - dx) > HIT_EPSILON;
            r.hitY = Math.abs(ay - dy) > HIT_EPSILON;
            r.hitZ = Math.abs(az - dz) > HIT_EPSILON;
            Telemetry t = this.sim.telemetry();
            this.updateBox();
            if (r.hitX || r.hitY || r.hitZ || r.obliqueContact() || t.grounded || Double.isFinite(this.env.solidDistance)) {
                this.fillSurface(r, t.grounded);
            }
            if (t.grounded || t.sleeping) {
                r.supportGap = -this.clip(1, -SUPPORT_PROBE);
            }
            this.sim.afterMove(r);
        }

        static double surfaceSide(boolean hit, double requested, double normal) {
            if (hit && requested != 0.0) {
                return Math.signum(requested);
            }
            if (Double.isFinite(normal) && Math.abs(normal) > OBLIQUE_AXIS) {
                return -Math.signum(normal);
            }
            return 0.0;
        }

        void fillSurface(MoveReport r, boolean grounded) {
            double sx = surfaceSide(r.hitX, r.requestedX, r.contactNormalX);
            double sy = surfaceSide(r.hitY, r.requestedY, r.contactNormalY);
            double sz = surfaceSide(r.hitZ, r.requestedZ, r.contactNormalZ);
            if (sy == 0.0 && (grounded || (sx == 0.0 && sz == 0.0))) {
                sy = -1.0;
            }
            SurfaceResponse.Mix mix = this.mix;
            mix.clear();
            this.face(mix, 0, sx, FACE_REACH);
            this.face(mix, 1, sy, sy < 0.0 ? BELOW_REACH : FACE_REACH);
            this.face(mix, 2, sz, FACE_REACH);
            SurfaceResponse response = mix.result();
            if (response != null) {
                response.writeTo(r);
            }
        }

        void face(SurfaceResponse.Mix mix, int axis, double side, double reach) {
            if (side == 0.0 || !Double.isFinite(side)) {
                return;
            }
            BoxWorld w = this.world;
            double c = w.cell;
            double[] o = w.origin;
            int u = (axis + 1) % 3;
            int v = (axis + 2) % 3;
            boolean outward = side > 0.0;
            double plane = outward ? this.max[axis] : this.min[axis];
            int first = w.cellOf(axis, outward ? plane - INSIDE : plane + INSIDE);
            int last = w.cellOf(axis, outward ? plane + reach : plane - reach);
            int step = outward ? 1 : -1;
            int[] cell = this.cell;
            for (int i = w.cellOf(u, this.min[u] + EDGE); i <= w.cellOf(u, this.max[u] - EDGE); i++) {
                double du = Math.min(this.max[u], o[u] + (i + 1) * c) - Math.max(this.min[u], o[u] + i * c);
                for (int j = w.cellOf(v, this.min[v] + EDGE); j <= w.cellOf(v, this.max[v] - EDGE); j++) {
                    double dv = Math.min(this.max[v], o[v] + (j + 1) * c) - Math.max(this.min[v], o[v] + j * c);
                    if (!(du > 0.0) || !(dv > 0.0)) {
                        continue;
                    }
                    cell[u] = i;
                    cell[v] = j;
                    for (int k = first; outward ? k <= last : k >= last; k += step) {
                        cell[axis] = k;
                        if (!w.solid(cell[0], cell[1], cell[2])) {
                            continue;
                        }
                        double near = o[axis] + (outward ? k : k + 1) * c;
                        boolean touching = outward ? near >= plane - INSIDE && near <= plane + reach
                                : near <= plane + INSIDE && near >= plane - reach;
                        if (!touching) {
                            continue;
                        }
                        mix.add(CONCRETE, du * dv);
                        break;
                    }
                }
            }
        }

        void escape() {
            if (this.sim.telemetry().sleeping) {
                return;
            }
            this.updateBox();
            double[] box = {this.min[0], this.min[1], this.min[2], this.max[0], this.max[1], this.max[2]};
            double[] out = this.resolveOut(box);
            if (out == null) {
                return;
            }
            this.x += out[0];
            this.y += out[1];
            this.z += out[2];
            this.sim.pushOut(out[0], out[1], out[2]);
        }

        double[] resolveOut(double[] box) {
            for (double v : box) {
                if (Double.isNaN(v)) {
                    return null;
                }
            }
            double[] core = inflate(box, -DEPEN_TOLERANCE);
            List<double[]> touched = new ArrayList<>();
            if (!this.collectCells(core, touched) || free(core, touched)) {
                return null;
            }
            List<double[]> solids = new ArrayList<>();
            if (!this.collectCells(inflate(box, DEPEN_REACH), solids)) {
                return null;
            }
            List<double[]> inside = new ArrayList<>();
            for (double[] solid : solids) {
                if (intersects(solid, core)) {
                    inside.add(solid);
                }
            }
            double[] best = null;
            double bestDistance = Double.POSITIVE_INFINITY;
            for (double[] direction : DIRECTIONS) {
                double distance = exitDistance(box, direction, DEPEN_REACH, solids, inside);
                if (distance < bestDistance - DEPEN_TIE) {
                    bestDistance = distance;
                    best = direction;
                }
            }
            return best == null ? null : new double[]{best[0] * bestDistance, best[1] * bestDistance, best[2] * bestDistance};
        }

        boolean collectCells(double[] area, List<double[]> out) {
            BoxWorld w = this.world;
            double c = w.cell;
            double[] o = w.origin;
            int[] lo = {w.cellOf(0, area[0]), w.cellOf(1, area[1]), w.cellOf(2, area[2])};
            int[] hi = {w.cellOf(0, area[3]), w.cellOf(1, area[4]), w.cellOf(2, area[5])};
            if ((long) (hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1) > DEPEN_MAX_CELLS) {
                return false;
            }
            for (int i = lo[0]; i <= hi[0]; i++) {
                for (int k = lo[2]; k <= hi[2]; k++) {
                    for (int j = lo[1]; j <= hi[1]; j++) {
                        if (!w.solid(i, j, k)) {
                            continue;
                        }
                        double[] cellBox = {o[0] + i * c, o[1] + j * c, o[2] + k * c, o[0] + (i + 1) * c, o[1] + (j + 1) * c, o[2] + (k + 1) * c};
                        if (intersects(cellBox, area)) {
                            out.add(cellBox);
                        }
                    }
                }
            }
            return true;
        }

        static double[] inflate(double[] b, double d) {
            return new double[]{b[0] - d, b[1] - d, b[2] - d, b[3] + d, b[4] + d, b[5] + d};
        }

        static boolean intersects(double[] a, double[] b) {
            return a[0] < b[3] && a[3] > b[0] && a[1] < b[4] && a[4] > b[1] && a[2] < b[5] && a[5] > b[2];
        }

        static boolean free(double[] box, List<double[]> solids) {
            for (double[] solid : solids) {
                if (intersects(solid, box)) {
                    return false;
                }
            }
            return true;
        }

        static double[] swept(double[] box, double[] shift) {
            double[] out = box.clone();
            for (int a = 0; a < 3; a++) {
                if (shift[a] < 0.0) {
                    out[a] += shift[a];
                } else if (shift[a] > 0.0) {
                    out[a + 3] += shift[a];
                }
            }
            return out;
        }

        static double clearing(double[] box, double[] d, double[] solid) {
            if (d[0] > 0.0) {
                return solid[3] - box[0];
            }
            if (d[0] < 0.0) {
                return box[3] - solid[0];
            }
            if (d[1] > 0.0) {
                return solid[4] - box[1];
            }
            if (d[1] < 0.0) {
                return box[4] - solid[1];
            }
            if (d[2] > 0.0) {
                return solid[5] - box[2];
            }
            return box[5] - solid[2];
        }

        static double exitDistance(double[] box, double[] direction, double limit, List<double[]> solids, List<double[]> inside) {
            List<Double> steps = new ArrayList<>();
            for (double[] solid : solids) {
                double step = clearing(box, direction, solid);
                if (step > 0.0 && step + DEPEN_CLEARANCE <= limit) {
                    steps.add(step + DEPEN_CLEARANCE);
                }
            }
            steps.sort(Double::compare);
            for (double step : steps) {
                double[] shift = {direction[0] * step, direction[1] * step, direction[2] * step};
                double[] moved = {box[0] + shift[0], box[1] + shift[1], box[2] + shift[2], box[3] + shift[0], box[4] + shift[1], box[5] + shift[2]};
                if (!free(moved, solids)) {
                    continue;
                }
                double[] path = inflate(swept(box, shift), -DEPEN_TOLERANCE);
                for (double[] solid : solids) {
                    if (intersects(solid, path) && !inside.contains(solid)) {
                        return Double.POSITIVE_INFINITY;
                    }
                }
                return step;
            }
            return Double.POSITIVE_INFINITY;
        }

        void updateBox() {
            double bottom = this.y + this.foot;
            this.min[0] = this.x - this.halfWidth;
            this.min[1] = bottom;
            this.min[2] = this.z - this.halfWidth;
            this.max[0] = this.x + this.halfWidth;
            this.max[1] = bottom + this.height;
            this.max[2] = this.z + this.halfWidth;
        }

        double clip(int axis, double d) {
            if (d == 0.0 || !Double.isFinite(d)) {
                return 0.0;
            }
            BoxWorld w = this.world;
            double c = w.cell;
            double[] o = w.origin;
            int a1 = (axis + 1) % 3;
            int a2 = (axis + 2) % 3;
            int lo1 = (int) Math.floor((this.min[a1] - o[a1]) / c + EPS);
            int hi1 = (int) Math.floor((this.max[a1] - o[a1]) / c - EPS);
            int lo2 = (int) Math.floor((this.min[a2] - o[a2]) / c + EPS);
            int hi2 = (int) Math.floor((this.max[a2] - o[a2]) / c - EPS);
            if (d > 0.0) {
                double maxCell = (this.max[axis] - o[axis]) / c;
                int start = (int) Math.ceil(maxCell - EPS);
                int end = (int) Math.ceil((this.max[axis] + d - o[axis]) / c) - 1;
                for (int k = start; k <= end; k++) {
                    if (this.slabSolid(axis, k, a1, lo1, hi1, a2, lo2, hi2)) {
                        return Math.max(0.0, Math.min(d, o[axis] + k * c - this.max[axis]));
                    }
                }
                return d;
            }
            double minCell = (this.min[axis] - o[axis]) / c;
            int start = (int) Math.floor(minCell + EPS) - 1;
            int end = (int) Math.floor((this.min[axis] + d - o[axis]) / c);
            for (int k = start; k >= end; k--) {
                if (this.slabSolid(axis, k, a1, lo1, hi1, a2, lo2, hi2)) {
                    return Math.min(0.0, Math.max(d, o[axis] + (k + 1) * c - this.min[axis]));
                }
            }
            return d;
        }

        boolean slabSolid(int axis, int k, int a1, int lo1, int hi1, int a2, int lo2, int hi2) {
            int[] cell = this.cell;
            cell[axis] = k;
            for (int i = lo1; i <= hi1; i++) {
                cell[a1] = i;
                for (int j = lo2; j <= hi2; j++) {
                    cell[a2] = j;
                    if (this.world.solid(cell[0], cell[1], cell[2])) {
                        return true;
                    }
                }
            }
            return false;
        }
    }

    /** The state of a frame (the same list as stateOf in tools/test-sim-model.mjs). */
    static List<String> state(Pilot pilot) {
        DroneSim s = pilot.sim;
        List<String> v = new ArrayList<>();
        StepResult r = pilot.result;
        for (double d : new double[]{pilot.x, pilot.y, pilot.z, r.dx, r.dy, r.dz, r.orientation.x, r.orientation.y, r.orientation.z,
                r.orientation.w}) {
            v.add(hex(d));
        }
        RigidBody b = s.body;
        for (double d : new double[]{b.px, b.py, b.pz, b.vx, b.vy, b.vz, b.qw, b.qx, b.qy, b.qz, b.lx, b.ly, b.lz}) {
            v.add(hex(d));
        }
        PowerSystem pw = s.power;
        for (int i = 0; i < AirframeSpec.MOTORS; i++) {
            v.add(hex(pw.omega[i]));
            v.add(hex(pw.current[i]));
            v.add(hex(s.dutyCur[i]));
            v.add(hex(s.propContact[i]));
            v.add(hex(s.thermal.motorTemp[i]));
            v.add(hex(s.thermal.escTemp[i]));
            v.add(hex(s.thermal.limit[i]));
            v.add(hex(s.thermal.torque[i]));
        }
        v.add(hex(pw.busVoltage));
        v.add(hex(pw.soc));
        v.add(hex(pw.packSoc));
        FlightController fc = s.fc;
        v.add(hex(fc.contactAuthority));
        v.add(hex(fc.restS));
        v.add(hex(fc.contactIdleS));
        v.add(String.valueOf(fc.knocked));
        v.add(String.valueOf(fc.contactHeld));
        Telemetry t = s.telemetry();
        v.add(String.valueOf(t.armed));
        v.add(String.valueOf(t.grounded));
        v.add(String.valueOf(t.sleeping));
        v.add(String.valueOf(t.crashCount));
        v.add(String.valueOf(t.impactCount));
        v.add(String.valueOf(t.propStrikeCount));
        v.add(String.valueOf(t.motorHot));
        v.add(String.valueOf(t.escDerating));
        v.add(String.valueOf(t.autoArmPending));
        v.add(hex(t.lastImpactSpeed));
        v.add(hex(t.hoverThrottleStick));
        v.add(String.valueOf(s.groundedFrames));
        v.add(String.valueOf(s.edgeActive));
        v.add(String.valueOf(s.pushOuts()));
        v.add(String.valueOf(r.substeps));
        v.add(String.join(";", pilot.events));
        return v;
    }

    static double segmentValue(JsonObject seg, String key, double hover) {
        if (!seg.has(key)) {
            return 0.0;
        }
        JsonElement e = seg.get(key);
        if (e.isJsonObject()) {
            return hover + e.getAsJsonObject().get("hover").getAsDouble();
        }
        return e.getAsDouble();
    }

    static JsonObject fly(JsonObject f, AirframeSpec p) throws Exception {
        SimTuning tuning = new SimTuning();
        if (f.has("tuning")) {
            for (Map.Entry<String, JsonElement> e : f.getAsJsonObject("tuning").entrySet()) {
                Field field = SimTuning.class.getField(e.getKey());
                if (field.getType() == boolean.class) {
                    field.setBoolean(tuning, e.getValue().getAsBoolean());
                } else {
                    field.setDouble(tuning, e.getValue().getAsDouble());
                }
            }
        }
        DroneSim sim = new DroneSim(p, new FlightControllerConfig(), tuning, f.get("seed").getAsLong());
        Pilot pilot = new Pilot(sim, new BoxWorld(f.getAsJsonObject("world")));
        if (f.has("wind")) {
            JsonObject w = f.getAsJsonObject("wind");
            pilot.wind = new double[]{w.get("x").getAsDouble(), w.get("y").getAsDouble(), w.get("z").getAsDouble(), w.get("gusts").getAsDouble()};
        }
        if (f.has("ambient")) {
            pilot.ambientTempC = f.get("ambient").getAsDouble();
        }
        JsonArray place = f.getAsJsonArray("place");
        pilot.place(place.get(0).getAsDouble(), place.get(1).getAsDouble(), place.get(2).getAsDouble(), place.get(3).getAsDouble());
        if (f.has("poseLocked") && f.get("poseLocked").getAsBoolean()) {
            sim.setPoseLocked(true);
        }
        double fps = f.get("fps").getAsDouble();
        int frames = (int) Math.round(f.get("seconds").getAsDouble() * fps);
        int every = f.get("every").getAsInt();
        JsonArray segments = f.getAsJsonArray("segments");
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        JsonArray checkpoints = new JsonArray();
        for (int k = 0; k < frames; k++) {
            double t = k / fps;
            JsonObject seg = null;
            for (JsonElement e : segments) {
                if (t < e.getAsJsonObject().get("until").getAsDouble()) {
                    seg = e.getAsJsonObject();
                    break;
                }
            }
            if (seg == null) {
                seg = segments.get(segments.size() - 1).getAsJsonObject();
            }
            double hover = sim.telemetry().hoverThrottleStick;
            PilotInput in = pilot.input;
            in.roll = segmentValue(seg, "roll", hover);
            in.pitch = segmentValue(seg, "pitch", hover);
            in.yaw = segmentValue(seg, "yaw", hover);
            in.throttle = segmentValue(seg, "throttle", hover);
            in.armSwitch = seg.has("arm") && seg.get("arm").getAsBoolean();
            in.mode = seg.has("mode") ? StabMode.valueOf(seg.get("mode").getAsString()) : StabMode.ACRO;
            pilot.frame(1.0 / fps);
            List<String> state = state(pilot);
            String line = String.join(",", state) + "\n";
            digest.update(line.getBytes(StandardCharsets.UTF_8));
            if ((k + 1) % every == 0 || k == frames - 1) {
                JsonObject cp = new JsonObject();
                cp.addProperty("frame", k);
                MessageDigest copy = (MessageDigest) digest.clone();
                cp.addProperty("hash", HexFormat.of().formatHex(copy.digest()).substring(0, 24));
                JsonArray values = new JsonArray();
                for (String value : state) {
                    values.add(value);
                }
                cp.add("state", values);
                checkpoints.add(cp);
            }
        }
        JsonObject out = new JsonObject();
        out.addProperty("name", f.get("name").getAsString());
        out.addProperty("frames", frames);
        out.add("checkpoints", checkpoints);
        return out;
    }
}

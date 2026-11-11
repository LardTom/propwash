// Test vectors for creative drones (creative flight controller propwash:creative_fc, drone editor) computed with the
// classes of the Propwash 0.6.0 release jar. The configurator's JavaScript port of the creative flight model is checked
// against them.
//
// The jar is used as it was released (propwash-fabric-26.3-0.6.0.jar, read only, never rebuilt): its classes and its
// built-in part data (data/propwash/propwash_parts/...) go straight onto the class path, next to Minecraft 26.3
// (not obfuscated, from the Fabric Loom cache) and the libraries Minecraft lists in mojang_minecraft_info.json (from the
// Gradle cache). No Minecraft bootstrap and no mod loader: like the mod's JUnit tests, only DroneBuild, PartIndex,
// CreativeFlight, CreativeLimits, CreativeCheck, AirframeSpec, BuildAnalysis, CameraMount and PartJson run. Add-on parts
// (Just More Parts) are registered by their mod's initializer, so they are not in PartIndex here and not in the vectors.
//
//   tools/creative-java/run.sh [<output json>]
//   (or by hand: javac -cp <cp> -d /tmp/x CreativeVectors.java && java -cp /tmp/x:<cp> CreativeVectors <release jar> <out>)
//
// Output: tools/fixtures/creative-analysis-vectors.json (format 1, one vector per line). Doubles are written with
// Double.toString (shortest round-trip form), floats as the double of the float, NaN/±Infinity as strings.

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;
import de.lardtom.propwash.api.part.PartKind;
import de.lardtom.propwash.build.Accessories;
import de.lardtom.propwash.build.AccessoryMount;
import de.lardtom.propwash.build.AccessoryType;
import de.lardtom.propwash.build.DroneBuild;
import de.lardtom.propwash.build.PartIndex;
import de.lardtom.propwash.build.PartInfo;
import de.lardtom.propwash.build.StackType;
import de.lardtom.propwash.creative.CreativeCheck;
import de.lardtom.propwash.creative.CreativeFlight;
import de.lardtom.propwash.creative.CreativeLimits;
import de.lardtom.propwash.creative.CreativeParam;
import de.lardtom.propwash.creative.CreativeSpec;
import de.lardtom.propwash.drone.CameraMount;
import de.lardtom.propwash.parts.PartJson;
import de.lardtom.propwash.sim.AirframeSpec;
import de.lardtom.propwash.sim.BuildAnalysis;

import java.io.InputStream;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.lang.reflect.RecordComponent;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.EnumMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.TreeMap;

public final class CreativeVectors {
    private static final List<DroneBuild> PRESETS = DroneBuild.PRESETS;
    private static final List<String> PRESET_NAMES = List.of("whoop", "cinewhoop", "freestyle", "racer", "long_range");
    private static final List<PartKind> FLIGHT_KINDS = List.of(PartKind.FRAME, PartKind.STACK, PartKind.MOTOR, PartKind.PROP,
            PartKind.BATTERY, PartKind.VIDEO);
    private static final int RANDOM_CASES = 120;

    private CreativeVectors() {
    }

    /** One vector: the installed build, the spec that goes into it and optional extras (raw input, preset reference). */
    private record Case(String name, DroneBuild installed, CreativeSpec spec, Object raw, DroneBuild reference) {
        Case(String name, DroneBuild installed, CreativeSpec spec) {
            this(name, installed, spec, null, null);
        }
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 2) {
            System.err.println("usage: CreativeVectors <propwash release jar> <output json>");
            System.exit(2);
        }
        long start = System.nanoTime();
        Path jar = Path.of(args[0]);
        Path out = Path.of(args[1]);
        String sha = sha256(jar);
        selfCheck();
        PartIndex.ensureBuiltins();

        List<Case> cases = cases();
        StringBuilder text = new StringBuilder(1 << 22);
        text.append("{\n  \"format\": 1,\n  \"source\": ");
        Json.string(text, "Propwash 0.6.0 (release jar " + jar.getFileName() + ", sha256 " + sha
                + "): CreativeFlight, CreativeLimits, CreativeCheck, AirframeSpec, BuildAnalysis, CameraMount with the mod's classes"
                + " (tools/creative-java/CreativeVectors.java)");
        text.append(",\n  \"part_ids\": ");
        Json.write(text, partIds());
        text.append(",\n  \"params\": [\n");
        CreativeParam[] params = CreativeParam.values();
        for (int i = 0; i < params.length; i++) {
            text.append("    ");
            Json.write(text, param(params[i]));
            text.append(i + 1 < params.length ? ",\n" : "\n");
        }
        text.append("  ],\n  \"vectors\": [\n");
        List<String> errors = new ArrayList<>();
        for (int i = 0; i < cases.size(); i++) {
            Map<String, Object> vector = vector(cases.get(i));
            if (vector.containsKey("error")) {
                errors.add(cases.get(i).name() + ": " + vector.get("error"));
            }
            text.append("    ");
            Json.write(text, vector);
            text.append(i + 1 < cases.size() ? ",\n" : "\n");
        }
        text.append("  ]\n}\n");
        Files.createDirectories(out.toAbsolutePath().getParent());
        Files.writeString(out, text, StandardCharsets.UTF_8);
        System.err.printf("%d vectors, %d errors, %.1f s, %d bytes -> %s%n", cases.size(), errors.size(),
                (System.nanoTime() - start) / 1.0E9, Files.size(out), out);
        for (String error : errors) {
            System.err.println("  error " + error);
        }
    }

    // ------------------------------------------------------------------ cases

    private static DroneBuild creative(DroneBuild installed) {
        return new DroneBuild(installed.frame(), StackType.CREATIVE_FC, installed.motor(), installed.prop(), installed.video(),
                installed.battery(), installed.accessories());
    }

    private static CreativeSpec template(DroneBuild preset) {
        EnumMap<PartKind, String> base = new EnumMap<>(PartKind.class);
        base.put(PartKind.FRAME, preset.frame().key());
        base.put(PartKind.STACK, preset.stack().key());
        base.put(PartKind.MOTOR, preset.motor().key());
        base.put(PartKind.PROP, preset.prop().key());
        base.put(PartKind.BATTERY, preset.battery().key());
        return new CreativeSpec(base, Map.of());
    }

    private static DroneBuild templateInstalled(DroneBuild preset) {
        return new DroneBuild(DroneBuild.WHOOP.frame(), StackType.CREATIVE_FC, DroneBuild.WHOOP.motor(), DroneBuild.WHOOP.prop(),
                preset.video(), DroneBuild.WHOOP.battery());
    }

    private static String name(DroneBuild preset) {
        return PRESET_NAMES.get(PRESETS.indexOf(preset));
    }

    private static CreativeSpec values(Map<CreativeParam, Double> values) {
        TreeMap<String, Double> map = new TreeMap<>();
        values.forEach((param, value) -> map.put(param.key(), value));
        return new CreativeSpec(Map.of(), map);
    }

    private static CreativeSpec one(CreativeParam param, double value) {
        return CreativeSpec.EMPTY.with(param, value);
    }

    private static List<Case> cases() {
        List<Case> cases = new ArrayList<>();
        // 1. creative controller on every preset, no values
        for (DroneBuild preset : PRESETS) {
            cases.add(new Case("empty_" + name(preset), creative(preset), CreativeSpec.EMPTY));
        }
        // 2. template of a preset on whoop parts flies like the preset
        for (DroneBuild preset : PRESETS) {
            cases.add(new Case("template_" + name(preset), templateInstalled(preset), template(preset), null, preset));
        }
        // 3. every non-automatic value set to its base value
        {
            DroneBuild plain = creative(DroneBuild.RACER);
            TreeMap<String, Double> values = new TreeMap<>();
            for (CreativeParam param : CreativeParam.values()) {
                if (!param.auto()) {
                    values.put(param.key(), CreativeFlight.baseValue(plain, param));
                }
            }
            cases.add(new Case("base_values_racer", plain, new CreativeSpec(Map.of(), values)));
        }
        // 4. every parameter alone
        for (CreativeParam param : CreativeParam.values()) {
            for (DroneBuild preset : List.of(DroneBuild.FREESTYLE, DroneBuild.WHOOP, DroneBuild.LONG_RANGE)) {
                DroneBuild plain = creative(preset);
                double base = CreativeFlight.baseValue(plain, param);
                double target;
                if (param.toggle()) {
                    target = base >= 0.5 ? 0.0 : 1.0;
                } else {
                    target = param.clamp(base * 1.37);
                    if (target == base || base == 0.0) {
                        target = param.clamp(base + 3.0 * param.step());
                    }
                    if (target == base) {
                        target = param.clamp(base - 3.0 * param.step());
                    }
                }
                cases.add(new Case("param_" + param.key() + "_" + name(preset), plain, one(param, target)));
            }
        }
        // 5. free arms
        {
            DroneBuild plain = creative(DroneBuild.FREESTYLE);
            CreativeSpec spec = CreativeSpec.EMPTY;
            for (CreativeParam param : CreativeParam.ARMS) {
                double base = CreativeFlight.baseValue(plain, param);
                spec = spec.with(param, param.key().endsWith(".up") ? base : base * 1.5);
            }
            cases.add(new Case("arms_free_freestyle", plain, spec));
            CreativeSpec stretched = spec.with(CreativeParam.ARM_FRONT_LEFT_FORWARD, 300.0).with(CreativeParam.ARM_FRONT_RIGHT_FORWARD, 300.0);
            cases.add(new Case("arms_stretched_freestyle", plain, stretched));
            double wheelbase = CreativeFlight.baseValue(plain, CreativeParam.WHEELBASE);
            cases.add(new Case("arms_one_wheelbase_freestyle", plain, CreativeSpec.EMPTY.with(CreativeParam.ARM_REAR_RIGHT_UP, 12.0)
                    .with(CreativeParam.WHEELBASE, (double) Math.round(1.25 * wheelbase))));
        }
        for (DroneBuild preset : PRESETS) {
            DroneBuild plain = creative(preset);
            double base = CreativeFlight.baseValue(plain, CreativeParam.ARM_FRONT_LEFT_FORWARD);
            cases.add(new Case("arms_one_" + name(preset), plain, one(CreativeParam.ARM_FRONT_LEFT_FORWARD, base + 20.0)));
        }
        // 6. wheelbase
        for (DroneBuild preset : PRESETS) {
            DroneBuild plain = creative(preset);
            double base = CreativeFlight.baseValue(plain, CreativeParam.WHEELBASE);
            cases.add(new Case("wheelbase_" + name(preset), plain, one(CreativeParam.WHEELBASE, (double) Math.round(1.25 * base))));
        }
        // 7. camera position
        for (DroneBuild preset : PRESETS) {
            DroneBuild plain = creative(preset);
            CreativeSpec spec = CreativeSpec.EMPTY;
            for (CreativeParam param : CreativeParam.CAMERA_POSITION) {
                spec = spec.with(param, CreativeFlight.baseValue(plain, param));
            }
            cases.add(new Case("camera_" + name(preset), plain, spec));
            double up = CreativeFlight.baseValue(plain, CreativeParam.CAMERA_UP);
            cases.add(new Case("camera_up_" + name(preset), plain, one(CreativeParam.CAMERA_UP, up + 15.0)));
        }
        // 8. inertia: roll doubled, pitch a fifth, yaw automatic
        for (DroneBuild preset : PRESETS) {
            DroneBuild plain = creative(preset);
            double roll = Math.rint(2.0 * CreativeFlight.baseValue(plain, CreativeParam.INERTIA_ROLL));
            double pitch = Math.rint(0.2 * CreativeFlight.baseValue(plain, CreativeParam.INERTIA_PITCH));
            cases.add(new Case("inertia_" + name(preset), plain,
                    CreativeSpec.EMPTY.with(CreativeParam.INERTIA_ROLL, roll).with(CreativeParam.INERTIA_PITCH, pitch)));
        }
        // 9. ducts
        cases.add(new Case("ducts_on_freestyle", creative(DroneBuild.FREESTYLE), one(CreativeParam.DUCTS, 1.0)));
        cases.add(new Case("ducts_off_whoop", creative(DroneBuild.WHOOP), one(CreativeParam.DUCTS, 0.0)));
        cases.add(new Case("ducts_on_long_range", creative(DroneBuild.LONG_RANGE), one(CreativeParam.DUCTS, 1.0)));
        // 10. cells (brownout rule of the patched stack)
        cases.add(new Case("cells_1_freestyle", creative(DroneBuild.FREESTYLE), one(CreativeParam.BATTERY_CELLS, 1.0)));
        cases.add(new Case("cells_12_freestyle", creative(DroneBuild.FREESTYLE), one(CreativeParam.BATTERY_CELLS, 12.0)));
        cases.add(new Case("cells_1_template_racer", templateInstalled(DroneBuild.RACER),
                template(DroneBuild.RACER).with(CreativeParam.BATTERY_CELLS, 1.0)));
        cases.add(new Case("cells_3_whoop", creative(DroneBuild.WHOOP), one(CreativeParam.BATTERY_CELLS, 3.0)));
        // 11. base parts
        for (PartKind kind : CreativeSpec.BASE_KINDS) {
            cases.add(new Case("base_" + kind.key() + "_whoop", creative(DroneBuild.WHOOP),
                    CreativeSpec.EMPTY.withBase(kind, part(DroneBuild.LONG_RANGE, kind).key())));
            cases.add(new Case("base_" + kind.key() + "_long_range", creative(DroneBuild.LONG_RANGE),
                    CreativeSpec.EMPTY.withBase(kind, part(DroneBuild.WHOOP, kind).key())));
            cases.add(new Case("base_" + kind.key() + "_nope_freestyle", creative(DroneBuild.FREESTYLE),
                    CreativeSpec.EMPTY.withBase(kind, "nope_part")));
        }
        cases.add(new Case("base_stack_aio_20_freestyle", creative(DroneBuild.FREESTYLE),
                CreativeSpec.EMPTY.withBase(PartKind.STACK, StackType.AIO_20.key())));
        {
            DroneBuild plain = creative(DroneBuild.FREESTYLE);
            CreativeSpec spec = CreativeSpec.EMPTY;
            for (PartKind kind : CreativeSpec.BASE_KINDS) {
                spec = spec.withBase(kind, part(plain, kind).key());
            }
            cases.add(new Case("base_installed_freestyle", plain, spec));
        }
        cases.add(new Case("base_installed_frame_whoop", creative(DroneBuild.WHOOP),
                CreativeSpec.EMPTY.withBase(PartKind.FRAME, DroneBuild.WHOOP.frame().key())));
        cases.add(new Case("base_wrong_kind_freestyle", creative(DroneBuild.FREESTYLE),
                CreativeSpec.EMPTY.withBase(PartKind.FRAME, DroneBuild.FREESTYLE.prop().key())));
        cases.add(new Case("base_namespaced_freestyle", creative(DroneBuild.FREESTYLE),
                CreativeSpec.EMPTY.withBase(PartKind.FRAME, DroneBuild.RACER.frame().id().toString())
                        .with(CreativeParam.MOTOR_KV, 2100.0)));
        // 12. accessories with and without values
        for (DroneBuild preset : List.of(DroneBuild.FREESTYLE, DroneBuild.CINEWHOOP)) {
            DroneBuild plain = creative(preset);
            double mass = Math.rint(1.4 * CreativeFlight.baseValue(plain, CreativeParam.FRAME_MASS));
            double kv = 10.0 * Math.rint(1.15 * CreativeFlight.baseValue(plain, CreativeParam.MOTOR_KV) / 10.0);
            CreativeSpec spec = CreativeSpec.EMPTY.with(CreativeParam.FRAME_MASS, mass).with(CreativeParam.MOTOR_KV, kv);
            for (PartInfo info : PartIndex.all(PartKind.ACCESSORY)) {
                AccessoryType accessory = (AccessoryType) info;
                if (!plain.frame().accessoryMounts.contains(accessory.mount) || !accessory.fitsFrame(plain.frame())) {
                    continue;
                }
                DroneBuild with = plain.withAccessory(accessory);
                cases.add(new Case("accessory_" + accessory.key() + "_" + name(preset), with, CreativeSpec.EMPTY));
                cases.add(new Case("accessory_" + accessory.key() + "_" + name(preset) + "_values", with, spec));
            }
            DroneBuild both = plain.withAccessory(AccessoryType.LED_STRIP).withAccessory(AccessoryType.ACTION_CAM_HEAVY);
            cases.add(new Case("accessory_led_strip+action_cam_heavy_" + name(preset) + "_values", both, spec));
        }
        // 13. corners of CreativeRobustnessTest
        for (DroneBuild preset : PRESETS) {
            DroneBuild plain = creative(preset);
            Map<CreativeParam, Double> low = new EnumMap<>(CreativeParam.class);
            Map<CreativeParam, Double> high = new EnumMap<>(CreativeParam.class);
            for (CreativeParam param : CreativeParam.values()) {
                low.put(param, param.min());
                high.put(param, param.max());
            }
            cases.add(new Case("extreme_min_" + name(preset), plain, values(low)));
            cases.add(new Case("extreme_max_" + name(preset), plain, values(high)));
            Map<CreativeParam, Double> rocket = new EnumMap<>(CreativeParam.class);
            rocket.put(CreativeParam.FRAME_MASS, CreativeParam.FRAME_MASS.min());
            rocket.put(CreativeParam.BATTERY_MASS, CreativeParam.BATTERY_MASS.min());
            rocket.put(CreativeParam.MOTOR_MASS, CreativeParam.MOTOR_MASS.min());
            rocket.put(CreativeParam.PROP_MASS, CreativeParam.PROP_MASS.min());
            rocket.put(CreativeParam.MOTOR_KV, CreativeParam.MOTOR_KV.max());
            rocket.put(CreativeParam.BATTERY_CELLS, CreativeParam.BATTERY_CELLS.max());
            rocket.put(CreativeParam.MOTOR_MAX_CURRENT, CreativeParam.MOTOR_MAX_CURRENT.max());
            rocket.put(CreativeParam.ESC_CURRENT, CreativeParam.ESC_CURRENT.max());
            rocket.put(CreativeParam.BATTERY_C_RATING, CreativeParam.BATTERY_C_RATING.max());
            rocket.put(CreativeParam.PROP_THRUST_COEFFICIENT, CreativeParam.PROP_THRUST_COEFFICIENT.max());
            rocket.put(CreativeParam.INERTIA_ROLL, CreativeParam.INERTIA_ROLL.min());
            rocket.put(CreativeParam.INERTIA_PITCH, CreativeParam.INERTIA_PITCH.min());
            rocket.put(CreativeParam.INERTIA_YAW, CreativeParam.INERTIA_YAW.min());
            cases.add(new Case("rocket_" + name(preset), plain, values(rocket)));
            Map<CreativeParam, Double> brick = new EnumMap<>(CreativeParam.class);
            brick.put(CreativeParam.FRAME_MASS, CreativeParam.FRAME_MASS.max());
            brick.put(CreativeParam.BATTERY_MASS, CreativeParam.BATTERY_MASS.max());
            brick.put(CreativeParam.PROP_DIAMETER, CreativeParam.PROP_DIAMETER.min());
            brick.put(CreativeParam.MOTOR_KV, CreativeParam.MOTOR_KV.min());
            brick.put(CreativeParam.INERTIA_ROLL, CreativeParam.INERTIA_ROLL.max());
            brick.put(CreativeParam.INERTIA_PITCH, CreativeParam.INERTIA_PITCH.max());
            brick.put(CreativeParam.INERTIA_YAW, CreativeParam.INERTIA_YAW.max());
            cases.add(new Case("brick_" + name(preset), plain, values(brick)));
        }
        // fast and slippery: beyond the server's speed limit (OVER_SERVER_SPEED)
        {
            Map<CreativeParam, Double> fast = new EnumMap<>(CreativeParam.class);
            fast.put(CreativeParam.MOTOR_KV, 3000.0);
            fast.put(CreativeParam.BATTERY_CELLS, 12.0);
            fast.put(CreativeParam.PROP_PITCH, 7.0);
            fast.put(CreativeParam.FRONTAL_AREA, 20.0);
            fast.put(CreativeParam.DRAG_COEFFICIENT, 0.2);
            fast.put(CreativeParam.MOTOR_MAX_CURRENT, 150.0);
            fast.put(CreativeParam.ESC_CURRENT, 150.0);
            fast.put(CreativeParam.BATTERY_C_RATING, 300.0);
            cases.add(new Case("over_speed_racer", creative(DroneBuild.RACER), values(fast)));
        }
        // 14. random edits
        Random random = new Random(0x5EEDL);
        for (int n = 0; n < RANDOM_CASES; n++) {
            cases.add(randomCase(n, random));
        }
        // 15. raw specs for sanitize
        cases.addAll(sanitizeCases());
        return cases;
    }

    private static PartInfo part(DroneBuild build, PartKind kind) {
        return switch (kind) {
            case FRAME -> build.frame();
            case STACK -> build.stack();
            case MOTOR -> build.motor();
            case PROP -> build.prop();
            case BATTERY -> build.battery();
            case VIDEO -> build.video();
            case ACCESSORY -> throw new IllegalArgumentException("accessory");
        };
    }

    private static Case randomCase(int n, Random random) {
        DroneBuild preset = PRESETS.get(random.nextInt(PRESETS.size()));
        DroneBuild installed = creative(preset);
        if (random.nextDouble() < 0.3) {
            List<AccessoryType> fitting = new ArrayList<>();
            for (PartInfo info : PartIndex.all(PartKind.ACCESSORY)) {
                AccessoryType accessory = (AccessoryType) info;
                if (!accessory.missing() && installed.frame().accessoryMounts.contains(accessory.mount) && accessory.fitsFrame(installed.frame())) {
                    fitting.add(accessory);
                }
            }
            if (!fitting.isEmpty()) {
                installed = installed.withAccessory(fitting.get(random.nextInt(fitting.size())));
            }
        }
        EnumMap<PartKind, String> base = new EnumMap<>(PartKind.class);
        List<PartKind> kinds = new ArrayList<>(CreativeSpec.BASE_KINDS);
        Collections.shuffle(kinds, random);
        int baseCount = random.nextInt(4);
        for (int i = 0; i < baseCount; i++) {
            PartKind kind = kinds.get(i);
            boolean withoutCreative = kind == PartKind.STACK && random.nextBoolean();
            List<PartInfo> candidates = new ArrayList<>();
            for (PartInfo info : PartIndex.all(kind)) {
                if (!info.missing() && !(withoutCreative && info == StackType.CREATIVE_FC)) {
                    candidates.add(info);
                }
            }
            base.put(kind, candidates.get(random.nextInt(candidates.size())).key());
        }
        List<CreativeParam> params = new ArrayList<>(List.of(CreativeParam.values()));
        Collections.shuffle(params, random);
        int count = 1 + random.nextInt(14);
        TreeMap<String, Double> values = new TreeMap<>();
        for (int i = 0; i < count; i++) {
            CreativeParam param = params.get(i);
            values.put(param.key(), sample(param, random));
        }
        return new Case("random_" + n, installed, new CreativeSpec(base, values));
    }

    private static double sample(CreativeParam param, Random random) {
        double min = param.min();
        double max = param.max();
        double u = random.nextDouble();
        double value = min > 0.0 ? Math.exp(Math.log(min) + u * (Math.log(max) - Math.log(min))) : min + u * (max - min);
        if (random.nextDouble() < 0.15) {
            double w = 0.05 + 0.95 * random.nextDouble();
            if (random.nextBoolean()) {
                double below = min > 0.0 ? 0.5 * min : min < 0.0 ? 2.0 * min : min - 1.0;
                value = min + w * (below - min);
            } else {
                double above = max > 0.0 ? 2.0 * max : max < 0.0 ? 0.5 * max : max + 1.0;
                value = max + w * (above - max);
            }
        }
        return value;
    }

    private static List<Case> sanitizeCases() {
        List<Case> cases = new ArrayList<>();
        List<DroneBuild> on = List.of(DroneBuild.FREESTYLE, DroneBuild.WHOOP, DroneBuild.RACER, DroneBuild.CINEWHOOP, DroneBuild.LONG_RANGE,
                DroneBuild.FREESTYLE);
        List<Map<PartKind, String>> bases = new ArrayList<>();
        List<Map<String, Double>> valueMaps = new ArrayList<>();
        // 1: the mod's sanitize test
        {
            EnumMap<PartKind, String> base = new EnumMap<>(PartKind.class);
            base.put(PartKind.FRAME, "freestyle_5");
            base.put(PartKind.MOTOR, "no_such_motor");
            base.put(PartKind.PROP, "freestyle_5");
            TreeMap<String, Double> values = new TreeMap<>();
            values.put(CreativeParam.MOTOR_KV.key(), 1.0E9);
            values.put(CreativeParam.PROP_BLADES.key(), 3.4);
            values.put(CreativeParam.FRAME_MASS.key(), -5.0);
            values.put("laser.power", 3.0);
            bases.add(base);
            valueMaps.add(values);
        }
        // 2: negative zero, non-finite and null values, video and accessory base (dropped by the spec itself)
        {
            EnumMap<PartKind, String> base = new EnumMap<>(PartKind.class);
            base.put(PartKind.VIDEO, "digital_hd");
            base.put(PartKind.ACCESSORY, "led_strip");
            base.put(PartKind.BATTERY, "b4s_650");
            TreeMap<String, Double> values = new TreeMap<>();
            values.put(CreativeParam.PROP_MASS.key(), -0.0);
            values.put(CreativeParam.ARM_FRONT_LEFT_UP.key(), -0.0);
            values.put(CreativeParam.CAMERA_RIGHT.key(), -0.0);
            values.put(CreativeParam.MOTOR_KV.key(), Double.NaN);
            values.put(CreativeParam.FRAME_MASS.key(), Double.POSITIVE_INFINITY);
            values.put(CreativeParam.BATTERY_MASS.key(), Double.NEGATIVE_INFINITY);
            values.put(CreativeParam.STACK_MASS.key(), null);
            values.put(CreativeParam.DUCTS.key(), -0.0);
            bases.add(base);
            valueMaps.add(values);
        }
        // 3: integer parameters with fractions (Math.rint: half to even)
        {
            TreeMap<String, Double> values = new TreeMap<>();
            values.put(CreativeParam.PROP_BLADES.key(), 3.4);
            values.put(CreativeParam.BATTERY_CELLS.key(), 2.5);
            values.put(CreativeParam.MOTOR_KV.key(), 1234.5);
            values.put(CreativeParam.WHEELBASE.key(), 100.5);
            values.put(CreativeParam.PROP_DIAMETER.key(), 127.5);
            values.put(CreativeParam.BATTERY_CAPACITY.key(), 1299.7);
            values.put(CreativeParam.CAMERA_FOV.key(), 120.49);
            values.put(CreativeParam.DUCTS.key(), 0.5);
            values.put(CreativeParam.BATTERY_C_RATING.key(), 0.4);
            bases.add(Map.of());
            valueMaps.add(values);
        }
        // 4: decimals and the tolerance of CLAMPED notes
        {
            TreeMap<String, Double> values = new TreeMap<>();
            values.put(CreativeParam.PROP_THRUST_COEFFICIENT.key(), 0.1234567);
            values.put(CreativeParam.PROP_POWER_COEFFICIENT.key(), 0.4001);
            values.put(CreativeParam.DRAG_COEFFICIENT.key(), 3.0004);
            values.put(CreativeParam.MOTOR_MASS.key(), 0.04);
            values.put(CreativeParam.PROP_PITCH.key(), 12.05);
            values.put(CreativeParam.FRAME_MASS.key(), 0.995);
            values.put(CreativeParam.INERTIA_ROLL.key(), 0.6);
            values.put(CreativeParam.INERTIA_YAW.key(), 6.0E6);
            values.put(CreativeParam.ARM_FRONT_LEFT_RIGHT.key(), 12.0);
            values.put(CreativeParam.CAMERA_FORWARD.key(), -650.25);
            bases.add(Map.of());
            valueMaps.add(values);
        }
        // 5: base ids: namespaced, add-on (not registered here), creative controller, upper case, empty
        {
            EnumMap<PartKind, String> base = new EnumMap<>(PartKind.class);
            base.put(PartKind.FRAME, "propwash:race_5");
            base.put(PartKind.PROP, "justmoreparts:p13_2b");
            base.put(PartKind.STACK, "creative_fc");
            base.put(PartKind.BATTERY, "B6S_1300");
            base.put(PartKind.MOTOR, "");
            TreeMap<String, Double> values = new TreeMap<>();
            values.put(CreativeParam.MOTOR_KV.key(), 1950.0);
            bases.add(base);
            valueMaps.add(values);
        }
        // 6: unknown and over-long keys next to clean values
        {
            EnumMap<PartKind, String> base = new EnumMap<>(PartKind.class);
            base.put(PartKind.MOTOR, "m2306_1860");
            base.put(PartKind.FRAME, "f".repeat(CreativeSpec.MAX_KEY_LENGTH + 1));
            TreeMap<String, Double> values = new TreeMap<>();
            values.put("laser.power", 1.0);
            values.put("Motor.KV", 2000.0);
            values.put("x".repeat(CreativeSpec.MAX_KEY_LENGTH + 1), 1.0);
            values.put(CreativeParam.MOTOR_KV.key(), 2000.0);
            values.put(CreativeParam.PROP_BLADES.key(), 4.0);
            bases.add(base);
            valueMaps.add(values);
        }
        for (int i = 0; i < bases.size(); i++) {
            Map<String, Object> raw = new LinkedHashMap<>();
            Map<String, Object> rawBase = new LinkedHashMap<>();
            bases.get(i).forEach((kind, key) -> rawBase.put(kind.key(), key));
            raw.put("base", rawBase);
            raw.put("values", new LinkedHashMap<>(valueMaps.get(i)));
            CreativeSpec spec = new CreativeSpec(bases.get(i), valueMaps.get(i));
            cases.add(new Case("sanitize_" + (i + 1), creative(on.get(i)), spec, raw, null));
        }
        return cases;
    }

    // ------------------------------------------------------------------ results

    private static Map<String, Object> vector(Case c) {
        Map<String, Object> v = new LinkedHashMap<>();
        v.put("name", c.name());
        DroneBuild build;
        try {
            build = c.installed().withCreative(c.spec());
        } catch (Throwable t) {
            v.put("error", error(t));
            return v;
        }
        CreativeSpec spec = build.creative();
        if (c.raw() != null) {
            v.put("raw", c.raw());
        }
        v.put("build", build(build));
        v.put("creative", spec(spec));
        try {
            Map<String, Object> result = new LinkedHashMap<>();
            CreativeLimits.Result sanitized = CreativeLimits.sanitize(spec);
            Map<String, Object> sanitizedJson = new LinkedHashMap<>();
            sanitizedJson.put("spec", spec(sanitized.spec()));
            List<Object> notes = new ArrayList<>();
            for (CreativeLimits.Note note : sanitized.notes()) {
                Map<String, Object> n = new LinkedHashMap<>();
                n.put("type", note.type().name());
                n.put("key", note.key());
                n.put("requested", Double.isNaN(note.requested()) ? null : note.requested());
                n.put("applied", Double.isNaN(note.applied()) ? null : note.applied());
                notes.add(n);
            }
            sanitizedJson.put("notes", notes);
            result.put("sanitized", sanitizedJson);
            Map<String, Object> value = new LinkedHashMap<>();
            Map<String, Object> base = new LinkedHashMap<>();
            for (CreativeParam param : CreativeParam.values()) {
                value.put(param.key(), CreativeFlight.value(build, param));
                base.put(param.key(), CreativeFlight.baseValue(build.withCreative(spec.without(param)), param));
            }
            result.put("value", value);
            result.put("base", base);
            double[] inertia = build.inertiaOverride();
            result.put("inertia", inertia == null ? null : doubles(inertia));
            result.put("flight", flight(build));
            result.put("airframe", airframe(AirframeSpec.of(build)));
            result.put("analysis", analysis(BuildAnalysis.of(build)));
            List<Object> warnings = new ArrayList<>();
            for (CreativeCheck.Warning warning : CreativeCheck.check(build)) {
                warnings.add(warning.name());
            }
            result.put("creative_warnings", warnings);
            CameraMount.Range range = CameraMount.range(build);
            Map<String, Object> uptilt = new LinkedHashMap<>();
            uptilt.put("min", range.minDeg());
            uptilt.put("max", range.maxDeg());
            uptilt.put("default", range.defaultDeg());
            result.put("uptilt", uptilt);
            if (c.reference() != null) {
                Map<String, Object> reference = new LinkedHashMap<>();
                reference.put("build", build(c.reference()));
                reference.put("airframe", airframe(AirframeSpec.of(c.reference())));
                reference.put("analysis", analysis(BuildAnalysis.of(c.reference())));
                result.put("preset_reference", reference);
            }
            v.putAll(result);
        } catch (Throwable t) {
            v.put("error", error(t));
        }
        return v;
    }

    private static String error(Throwable t) {
        return t.getClass().getName() + ": " + t.getMessage();
    }

    private static Map<String, Object> build(DroneBuild build) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("frame", build.frame().id().toString());
        out.put("stack", build.stack().id().toString());
        out.put("motor", build.motor().id().toString());
        out.put("prop", build.prop().id().toString());
        out.put("video", build.video().id().toString());
        out.put("battery", build.battery().id().toString());
        Map<String, Object> accessories = new LinkedHashMap<>();
        for (Map.Entry<AccessoryMount, AccessoryType> entry : build.accessories().byMount().entrySet()) {
            accessories.put(entry.getKey().key(), entry.getValue().id().toString());
        }
        out.put("accessories", accessories);
        return out;
    }

    private static Map<String, Object> spec(CreativeSpec spec) {
        Map<String, Object> out = new LinkedHashMap<>();
        Map<String, Object> base = new LinkedHashMap<>();
        spec.base().forEach((kind, key) -> base.put(kind.key(), key));
        out.put("base", base);
        out.put("values", new LinkedHashMap<String, Object>(spec.values()));
        return out;
    }

    private static Map<String, Object> flight(DroneBuild build) {
        DroneBuild flight = build.flight();
        CreativeFlight.Base base = CreativeFlight.base(build);
        Map<String, Object> out = new LinkedHashMap<>();
        List<Object> same = new ArrayList<>();
        Map<String, Object> ids = new LinkedHashMap<>();
        for (PartKind kind : FLIGHT_KINDS) {
            PartInfo part = part(flight, kind);
            out.put(kind.key(), PartJson.encode(part.definition()));
            if (part == base.part(kind)) {
                same.add(kind.key());
            }
            ids.put(kind.key(), part.key());
        }
        out.put("same", same);
        out.put("ids", ids);
        return out;
    }

    private static Map<String, Object> airframe(AirframeSpec spec) throws ReflectiveOperationException {
        Map<String, Object> out = new LinkedHashMap<>();
        for (Field field : AirframeSpec.class.getDeclaredFields()) {
            int modifiers = field.getModifiers();
            if (!Modifier.isPublic(modifiers) || Modifier.isStatic(modifiers)) {
                continue;
            }
            Class<?> type = field.getType();
            if (type == double.class || type == int.class || type == boolean.class || type == float.class || type == long.class
                    || type == String.class) {
                out.put(field.getName(), field.get(spec));
            }
        }
        List<Object> x = new ArrayList<>();
        List<Object> y = new ArrayList<>();
        List<Object> z = new ArrayList<>();
        List<Object> spin = new ArrayList<>();
        for (int i = 0; i < AirframeSpec.MOTORS; i++) {
            x.add(spec.motorX(i));
            y.add(spec.motorY(i));
            z.add(spec.motorZ(i));
            spin.add(spec.spin(i));
        }
        out.put("motorX", x);
        out.put("motorY", y);
        out.put("motorZ", z);
        out.put("spin", spin);
        return out;
    }

    private static Map<String, Object> analysis(BuildAnalysis analysis) throws ReflectiveOperationException {
        Map<String, Object> out = new LinkedHashMap<>();
        for (RecordComponent component : BuildAnalysis.class.getRecordComponents()) {
            Object value = component.getAccessor().invoke(analysis);
            if (value instanceof Collection<?> collection) {
                List<Enum<?>> list = new ArrayList<>();
                for (Object item : collection) {
                    list.add((Enum<?>) item);
                }
                list.sort((a, b) -> Integer.compare(a.ordinal(), b.ordinal()));
                List<Object> names = new ArrayList<>();
                for (Enum<?> item : list) {
                    names.add(item.name());
                }
                out.put(component.getName(), names);
            } else {
                out.put(component.getName(), value);
            }
        }
        return out;
    }

    private static List<Object> doubles(double[] values) {
        List<Object> out = new ArrayList<>();
        for (double value : values) {
            out.add(value);
        }
        return out;
    }

    private static Map<String, Object> param(CreativeParam param) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("key", param.key());
        out.put("group", param.group().key());
        out.put("part", param.part().map(PartKind::key).orElse(null));
        out.put("unit", param.unit());
        out.put("min", param.min());
        out.put("max", param.max());
        out.put("step", param.step());
        out.put("decimals", param.decimals());
        out.put("kind", param.kind().name());
        return out;
    }

    private static Map<String, Object> partIds() {
        Map<String, Object> out = new LinkedHashMap<>();
        for (PartKind kind : PartKind.values()) {
            List<Object> ids = new ArrayList<>();
            for (PartInfo part : PartIndex.all(kind)) {
                ids.add(part.id().toString());
            }
            out.put(kind.key(), ids);
        }
        return out;
    }

    // ------------------------------------------------------------------ checks and helpers

    private static void selfCheck() {
        Gson gson = new GsonBuilder().disableHtmlEscaping().create();
        for (double d : new double[]{0.012, 79.54951288348659, 1.0E-4, 5.0E6, 0.1 + 0.2}) {
            JsonArray array = new JsonArray();
            array.add(d);
            StringBuilder mine = new StringBuilder();
            Json.write(mine, array);
            String theirs = gson.toJson(array);
            String expected = "[" + Double.toString(d) + "]";
            if (!mine.toString().equals(expected) || !theirs.equals(expected) || Double.parseDouble(Double.toString(d)) != d) {
                throw new IllegalStateException("number format: " + d + " -> " + mine + " / " + theirs);
            }
        }
        StringBuilder check = new StringBuilder();
        JsonObject frame = PartJson.encode(DroneBuild.FREESTYLE.frame().definition());
        Json.write(check, frame);
        if (!check.toString().contains("\"frontal_area_m2\":0.012")) {
            throw new IllegalStateException("PartJson frame aero: " + check);
        }
        System.err.println("self check: 0.012 and 79.54951288348659 survive Gson and the writer unchanged");
    }

    private static String sha256(Path file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream in = Files.newInputStream(file)) {
            byte[] buffer = new byte[1 << 16];
            int read;
            while ((read = in.read(buffer)) > 0) {
                digest.update(buffer, 0, read);
            }
        }
        return HexFormat.of().formatHex(digest.digest());
    }

    /** Minimal JSON writer: shortest round-trip doubles, floats widened to double, non-finite numbers as strings. */
    private static final class Json {
        private Json() {
        }

        static void write(StringBuilder out, Object value) {
            switch (value) {
                case null -> out.append("null");
                case String s -> string(out, s);
                case Boolean b -> out.append(b);
                case Double d -> number(out, d);
                case Float f -> number(out, (double) f);
                case Integer i -> out.append(i);
                case Long l -> out.append(l);
                case Map<?, ?> map -> {
                    out.append('{');
                    boolean first = true;
                    for (Map.Entry<?, ?> entry : map.entrySet()) {
                        if (!first) {
                            out.append(',');
                        }
                        first = false;
                        string(out, String.valueOf(entry.getKey()));
                        out.append(':');
                        write(out, entry.getValue());
                    }
                    out.append('}');
                }
                case List<?> list -> {
                    out.append('[');
                    for (int i = 0; i < list.size(); i++) {
                        if (i > 0) {
                            out.append(',');
                        }
                        write(out, list.get(i));
                    }
                    out.append(']');
                }
                case JsonElement element -> element(out, element);
                default -> throw new IllegalArgumentException("no JSON for " + value.getClass());
            }
        }

        static void element(StringBuilder out, JsonElement element) {
            if (element == null || element.isJsonNull()) {
                out.append("null");
            } else if (element.isJsonObject()) {
                Map<String, Object> map = new LinkedHashMap<>();
                for (Map.Entry<String, JsonElement> entry : element.getAsJsonObject().entrySet()) {
                    map.put(entry.getKey(), entry.getValue());
                }
                write(out, map);
            } else if (element.isJsonArray()) {
                List<Object> list = new ArrayList<>();
                for (JsonElement item : element.getAsJsonArray()) {
                    list.add(item);
                }
                write(out, list);
            } else {
                JsonPrimitive primitive = element.getAsJsonPrimitive();
                if (primitive.isBoolean()) {
                    out.append(primitive.getAsBoolean());
                } else if (primitive.isString()) {
                    string(out, primitive.getAsString());
                } else {
                    Number number = primitive.getAsNumber();
                    if (number instanceof Double || number instanceof Float) {
                        number(out, number.doubleValue());
                    } else if (number instanceof Integer || number instanceof Long || number instanceof Short || number instanceof Byte) {
                        out.append(number.longValue());
                    } else {
                        out.append(number.toString());
                    }
                }
            }
        }

        static void number(StringBuilder out, double d) {
            if (Double.isNaN(d)) {
                out.append("\"NaN\"");
            } else if (Double.isInfinite(d)) {
                out.append(d > 0 ? "\"Infinity\"" : "\"-Infinity\"");
            } else {
                out.append(Double.toString(d));
            }
        }

        static void string(StringBuilder out, String s) {
            out.append('"');
            for (int i = 0; i < s.length(); i++) {
                char c = s.charAt(i);
                switch (c) {
                    case '"' -> out.append("\\\"");
                    case '\\' -> out.append("\\\\");
                    case '\n' -> out.append("\\n");
                    case '\r' -> out.append("\\r");
                    case '\t' -> out.append("\\t");
                    default -> {
                        if (c < 0x20 || c == 0x2028 || c == 0x2029) {
                            out.append(String.format("\\u%04x", (int) c));
                        } else {
                            out.append(c);
                        }
                    }
                }
            }
            out.append('"');
        }
    }
}

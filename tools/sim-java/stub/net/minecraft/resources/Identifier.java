// Stand-in for Minecraft's net.minecraft.resources.Identifier, written for tools/build-sim-vectors.mjs (not Minecraft
// code): a namespace:path value with the methods the parts, build and sim packages of Propwash call. It lets the built-in
// parts, DroneBuild, ParamDerivation and DroneSim of the release jar run without Minecraft on the class path.
package net.minecraft.resources;

public final class Identifier implements Comparable<Identifier> {
    public static final char NAMESPACE_SEPARATOR = ':';
    public static final String DEFAULT_NAMESPACE = "minecraft";
    private final String namespace;
    private final String path;

    private Identifier(String namespace, String path) {
        this.namespace = namespace;
        this.path = path;
    }

    public static Identifier fromNamespaceAndPath(String namespace, String path) {
        if (!validNamespace(namespace) || !validPath(path)) {
            throw new IllegalArgumentException("Non [a-z0-9_.-] character in identifier: " + namespace + ":" + path);
        }
        return new Identifier(namespace, path);
    }

    public static Identifier withDefaultNamespace(String path) {
        return fromNamespaceAndPath(DEFAULT_NAMESPACE, path);
    }

    public static Identifier parse(String text) {
        int colon = text.indexOf(':');
        return colon >= 0 ? fromNamespaceAndPath(colon == 0 ? DEFAULT_NAMESPACE : text.substring(0, colon), text.substring(colon + 1))
                : withDefaultNamespace(text);
    }

    public static Identifier tryParse(String text) {
        try {
            return parse(text);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    public static Identifier tryBuild(String namespace, String path) {
        return validNamespace(namespace) && validPath(path) ? new Identifier(namespace, path) : null;
    }

    static boolean validNamespace(String s) {
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (!(c == '_' || c == '-' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '.')) {
                return false;
            }
        }
        return true;
    }

    static boolean validPath(String s) {
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (!(c == '_' || c == '-' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '/' || c == '.')) {
                return false;
            }
        }
        return true;
    }

    public String getNamespace() {
        return this.namespace;
    }

    public String getPath() {
        return this.path;
    }

    @Override
    public String toString() {
        return this.namespace + ":" + this.path;
    }

    @Override
    public boolean equals(Object o) {
        return this == o || o instanceof Identifier other && this.namespace.equals(other.namespace) && this.path.equals(other.path);
    }

    @Override
    public int hashCode() {
        return 31 * this.namespace.hashCode() + this.path.hashCode();
    }

    @Override
    public int compareTo(Identifier o) {
        int c = this.path.compareTo(o.path);
        return c != 0 ? c : this.namespace.compareTo(o.namespace);
    }
}

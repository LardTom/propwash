// Stand-in for Minecraft's net.minecraft.world.item.Rarity, written for tools/build-sim-vectors.mjs (not Minecraft
// code): the four values with their serialized names, which parts.PartJson reads when it loads the built-in parts.
package net.minecraft.world.item;

public enum Rarity {
    COMMON("common"), UNCOMMON("uncommon"), RARE("rare"), EPIC("epic");

    private final String name;

    Rarity(String name) {
        this.name = name;
    }

    public String getSerializedName() {
        return this.name;
    }
}

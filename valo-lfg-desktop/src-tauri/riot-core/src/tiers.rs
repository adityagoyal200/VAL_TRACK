//! Valorant competitive tier numbers -> display names.

/// Map a competitive tier id (0..=27) to its rank name, e.g. 21 -> "Ascendant 1".
pub fn tier_name(tier: u8) -> String {
    const GROUPS: [&str; 8] = [
        "Iron", "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Ascendant", "Immortal",
    ];
    match tier {
        0 => "Unranked".to_string(),
        27 => "Radiant".to_string(),
        // Tiers 1 and 2 are unused; ranks start at 3 (Iron 1).
        3..=26 => {
            let idx = ((tier - 3) / 3) as usize;
            let division = ((tier - 3) % 3) + 1;
            format!("{} {}", GROUPS[idx], division)
        }
        _ => "Unranked".to_string(),
    }
}

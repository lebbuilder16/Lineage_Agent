#!/usr/bin/env python3
"""
extract_figma_tokens.py
Reads Figma file JSON from stdin and prints all solid fill colors + fonts.

Usage:
  curl -s -H "X-Figma-Token: $FIGMA_TOKEN" \
    "https://api.figma.com/v1/files/a6PHaT6GaxDYFGRuGNxTGZ" | \
    python3 scripts/extract_figma_tokens.py
"""
import sys
import json


def hex_from_rgba(r, g, b):
    return "#{:02X}{:02X}{:02X}".format(int(r * 255), int(g * 255), int(b * 255))


def walk(node, fills, fonts):
    for fill in node.get("fills", []):
        if fill.get("type") == "SOLID" and fill.get("visible", True):
            c = fill["color"]
            h = hex_from_rgba(c["r"], c["g"], c["b"])
            fills.add((h, node.get("name", "")[:60]))
    style = node.get("style", {})
    if style.get("fontFamily"):
        fonts.add((
            style["fontFamily"],
            style.get("fontWeight", ""),
            round(style.get("fontSize", 0)),
        ))
    for child in node.get("children", []):
        walk(child, fills, fonts)


def main():
    data = json.load(sys.stdin)
    doc = data.get("document", {})
    fills = set()
    fonts = set()
    for page in doc.get("children", []):
        walk(page, fills, fonts)

    print(f"=== COLORS ({len(fills)}) ===")
    for h, name in sorted(fills, key=lambda x: x[0]):
        print(f"  {h}  {name}")

    print(f"\n=== FONTS ({len(fonts)}) ===")
    for fam, weight, size in sorted(fonts):
        print(f"  {fam} | weight={weight} | size={size}px")


if __name__ == "__main__":
    main()

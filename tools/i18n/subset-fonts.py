#!/usr/bin/env python3
"""Cuts the web fonts in assets/fonts/ from their OFL sources (google/fonts, ofl/saira, ofl/jetbrainsmono, ofl/exo2).

    python3 tools/i18n/subset-fonts.py --src <folder with the source fonts>

The folder holds Saira[wdth,wght].ttf, JetBrainsMono[wght].ttf and Exo2[wght].ttf (variable fonts). Needs fontTools
and brotli (pip install fonttools brotli). Writes:

    saira-var.woff2                    Saira, Latin + Latin Extended-A (wdth 50-125, wght 100-900)
    jetbrains-mono-var.woff2           JetBrains Mono, Latin + Latin Extended-A (wght 100-800)
    exo2-cyrillic-var.woff2            Exo 2, Cyrillic (wght 100-900), for the Cyrillic letters of the Russian pages
    jetbrains-mono-cyrillic-var.woff2  JetBrains Mono, Cyrillic (wght 100-800)

tools/i18n/test-i18n.mjs checks that every letter of every language is in the fonts its pages load.
"""

import argparse
import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

LATIN = ('U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0300-0301,U+0303-0304,U+0308-0309,'
         'U+0323,U+0329,U+2000-206F,U+20AC,U+2122,U+2190-2193,U+21E7,U+2212,U+2215,U+2303,U+2318,U+2325,U+FEFF,U+FFFD')
LATIN_EXT_A = 'U+0100-017F'
CYRILLIC = 'U+0301,U+0400-04FF,U+2116'
SANS = ['ccmp', 'dnom', 'frac', 'liga', 'locl', 'numr', 'pnum', 'rvrn', 'tnum', 'kern', 'mark', 'mkmk']
MONO = ['calt', 'ccmp', 'frac', 'locl', 'kern', 'mark', 'mkmk']

FONTS = [
    ('Saira[wdth,wght].ttf', 'saira-var.woff2', LATIN + ',' + LATIN_EXT_A, SANS),
    ('JetBrainsMono[wght].ttf', 'jetbrains-mono-var.woff2', LATIN + ',' + LATIN_EXT_A, MONO),
    ('Exo2[wght].ttf', 'exo2-cyrillic-var.woff2', CYRILLIC, SANS),
    ('JetBrainsMono[wght].ttf', 'jetbrains-mono-cyrillic-var.woff2', CYRILLIC, MONO),
]


def unicodes(spec):
    out = []
    for part in spec.split(','):
        part = part.strip()[2:]
        if '-' in part:
            a, b = part.split('-')
            out.extend(range(int(a, 16), int(b, 16) + 1))
        else:
            out.append(int(part, 16))
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--src', required=True, help='folder with the source fonts')
    parser.add_argument('--out', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'fonts'))
    args = parser.parse_args()
    for source, target, spec, features in FONTS:
        path = os.path.join(args.src, source)
        if not os.path.exists(path):
            sys.exit(f'missing {path}')
        options = subset.Options()
        options.flavor = 'woff2'
        options.layout_features = features
        options.name_IDs = ['*']
        options.name_languages = ['*']
        options.notdef_outline = True
        font = TTFont(path, recalcTimestamp=False)
        sub = subset.Subsetter(options)
        sub.populate(unicodes=unicodes(spec))
        sub.subset(font)
        out = os.path.join(args.out, target)
        font.flavor = 'woff2'
        font.save(out)
        print(f'{target}: {len(font.getBestCmap())} characters, {os.path.getsize(out)} bytes')


if __name__ == '__main__':
    main()

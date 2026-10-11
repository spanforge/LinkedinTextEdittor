"""Developer-only generator. Unicode character names verify tables independently of JS offsets."""
import json, pathlib, unicodedata
styles = {'sansBold': 'SANS-SERIF BOLD', 'sansItalic': 'SANS-SERIF ITALIC', 'sansBoth': 'SANS-SERIF BOLD ITALIC', 'serifBold': 'BOLD', 'serifItalic': 'ITALIC', 'serifBoth': 'BOLD ITALIC'}
fixtures = {'unicodeVersion': unicodedata.unidata_version, 'source': 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 'styles': {}}
digit_names = ['ZERO','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE']
for key, name in styles.items():
    value = ''.join(unicodedata.lookup(f'MATHEMATICAL {name} CAPITAL {c}') for c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    value += ''.join('ℎ' if key == 'serifItalic' and c == 'h' else unicodedata.lookup(f'MATHEMATICAL {name} SMALL {c.upper()}') for c in 'abcdefghijklmnopqrstuvwxyz')
    digit_style = 'SANS-SERIF BOLD' if key.startswith('sans') else 'BOLD'
    value += '0123456789' if key.endswith('Italic') else ''.join(unicodedata.lookup(f'MATHEMATICAL {digit_style} DIGIT {d}') for d in digit_names)
    fixtures['styles'][key] = value
pathlib.Path('tests/fixtures').mkdir(parents=True, exist_ok=True)
pathlib.Path('tests/fixtures/unicode-golden.json').write_text(json.dumps(fixtures, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print('Created independent Unicode-name fixtures using Unicode', unicodedata.unidata_version)

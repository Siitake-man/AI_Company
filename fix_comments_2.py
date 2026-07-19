import re

def process_file(filepath, replacements):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content
    for old, new in replacements:
        content = content.replace(old, new)

    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {filepath}")

# Re-fix the specific line in HomeScreen.tsx
process_file('src/components/HomeScreen.tsx', [
    (
        '<div className="w-64 bg-[#e8dcc4] border-r-4 border-[#2e1500] p-4 flex flex-col gap-4" style={{ height: \'100%\', minHeight: 0, overflow: \'hidden\' }}>\n        <div className="wood-panel rounded-xl p-4 flex flex-col gap-3 h-full overflow-y-auto">',
        '<div className="w-64 shrink-0 sidebar-wood rounded-xl flex flex-col p-4 gap-4" style={{ height: \'100%\', minHeight: 0, overflow: \'hidden\' }}>\n        <div className="panel-paper p-3 text-center mb-1 shrink-0 bg-[#F5E6C8]">'
    ),
    (
        '<h2 className="font-title text-xl font-bold text-[var(--color-text)] tracking-wide flex items-center justify-center gap-1">',
        '<h2 className="font-title text-xl font-bold text-[#3d2b1f] tracking-wide flex items-center justify-center gap-1">'
    )
])

with open('src/index.css', 'r', encoding='utf-8') as f:
    css = f.read()

# We need to revert all changes mentioned in the comments specifically targeting those lines
css = css.replace('transform: translate(0px, 4px);', 'transform: translate(2px, 2px);')
css = css.replace('transform: translate(0px, 3px);', 'transform: translate(2px, 2px);')

with open('src/index.css', 'w', encoding='utf-8') as f:
    f.write(css)

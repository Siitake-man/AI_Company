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

# Revert specific lines according to PR comments
process_file('src/components/HomeScreen.tsx', [
    (
        '<div className="w-64 bg-[#e8dcc4] border-r-4 border-[#2e1500] p-4 flex flex-col gap-4" style={{ height: \'100%\', minHeight: 0, overflow: \'hidden\' }}>\n        <div className="wood-panel rounded-xl p-4 flex flex-col gap-3 h-full overflow-y-auto">\n          <h2 className="font-title text-xl font-bold text-[var(--color-text)] tracking-wide flex items-center justify-center gap-1">',
        '<div className="w-64 shrink-0 sidebar-wood rounded-xl flex flex-col p-4 gap-4" style={{ height: \'100%\', minHeight: 0, overflow: \'hidden\' }}>\n        <div className="panel-paper p-3 text-center mb-1 shrink-0 bg-[#F5E6C8]">\n          <h2 className="font-title text-xl font-bold text-[#3d2b1f] tracking-wide flex items-center justify-center gap-1">'
    ),
    (
        '<div className="flex-1 paper-texture relative overflow-y-auto p-6 md:p-10 flex flex-col"\n          style={{ minHeight: 0, overflowX: \'hidden\' }}>',
        '<div style={{ display: \'flex\', flexDirection: \'column\', flex: \'1 1 0%\', minHeight: 0, height: \'100%\', overflow: \'hidden\' }}>'
    ),
    (
        'className="retro-button bg-[#F9BA1D] hover:bg-[#ffca40] text-[var(--color-text)] font-bold text-2xl px-12 py-4 rounded-2xl flex items-center gap-4 transition-transform"',
        'className="btn-primary text-md py-3.5 px-10 rounded-xl shadow-md hover:scale-[1.02] transition-transform flex items-center gap-2.5 font-bold"'
    )
])

process_file('src/components/MeetingScreen.tsx', [
    (
        'bg-[var(--color-panel)]/40 border-dashed border-[var(--color-border-inner)] text-[#5c4636]',
        'bg-[#f5e6c8]/40 border-dashed border-[#c8a96e] text-[#5c4636]'
    )
])

process_file('src/index.css', [
    (
        'font-family: \'Bricolage Grotesque\', sans-serif;',
        'font-family: \'M PLUS Rounded 1c\', sans-serif;'
    ),
    (
        'border: 2px solid #8B5A2B;',
        'border: 2px solid var(--color-border-outer);'
    ),
    (
        'transform: translate(2px, 2px);',
        'transform: translate(0px, 4px);'
    ),
    (
        'box-shadow: 3px 3px 0px rgba(62, 39, 35, 0.4);',
        'box-shadow: 0px 4px 0px var(--color-accent-shadow);'
    ),
    (
        'box-shadow: 3px 3px 0px rgba(62, 39, 35, 0.4);',
        'box-shadow: 0px 3px 0px var(--color-border-outer);'
    )
])

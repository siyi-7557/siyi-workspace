filepath = r'G:\SIYI-Hermess\Siyi-OS\clients\personal-ai\backend\public\modules\obsidian-reviews\module.js'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

before = content.count('obs-primary-btn')
content = content.replace('class="obs-primary-btn"', 'class="btn btn-primary"')
after = content.count('obs-primary-btn')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print(f'按钮样式统一完成：替换了 {before - after} 处 obs-primary-btn -> btn btn-primary')

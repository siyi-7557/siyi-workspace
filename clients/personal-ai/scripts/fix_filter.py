import re

filepath = r'G:\SIYI-Hermess\Siyi-OS\clients\personal-ai\backend\public\modules\obsidian-reviews\module.js'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 找到loadReviews方法中的API请求行
old_pattern = r"const data = await API\.request\('GET',\s*`/reviews/ability/obsidian/reviews\?page=\$\{this\.page\}&pageSize=\$\{this\.pageSize\}&sortBy=\$\{this\.sortBy\}&sortOrder=\$\{this\.sortOrder\}`\);"

new_code = """const params = new URLSearchParams({
        page: this.page,
        pageSize: this.pageSize,
        sortBy: this.sortBy,
        sortOrder: this.sortOrder
      });
      if (this.reviewFilter.project) params.set('project', this.reviewFilter.project);
      if (this.reviewFilter.score) params.set('score', this.reviewFilter.score);
      const data = await API.request('GET',
        `/reviews/ability/obsidian/reviews?${params.toString()}`);"""

if re.search(old_pattern, content):
    content = re.sub(old_pattern, new_code, content)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print('筛选bug修复成功！')
else:
    print('未找到匹配的代码')
    idx = content.find('async loadReviews')
    if idx >= 0:
        print('loadReviews附近内容:')
        print(content[idx:idx+500])

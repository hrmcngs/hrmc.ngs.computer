document.getElementById('countForm').addEventListener('submit', async function(e) {
  e.preventDefault();

  const username = document.getElementById('username').value.trim();
  const year = document.getElementById('year').value;
  const month = document.getElementById('month').value.padStart(2, '0');
  const token = document.getElementById('token').value.trim();
  const headers = token ? { 'Authorization': 'token ' + token } : {};

  const since = `${year}-${month}-01T00:00:00Z`;
  const endMonth = (month === '12') ? '01' : String(Number(month) + 1).padStart(2, '0');
  const endYear = (month === '12') ? String(Number(year) + 1) : year;
  const until = `${endYear}-${endMonth}-01T00:00:00Z`;

  const resultDiv = document.getElementById('result');
  resultDiv.textContent = '読み込み中...';
  resultDiv.classList.add('loading');

  // Pull Request数取得
  let prCount = 0;
  try {
    const prRes = await fetch(
      `https://api.github.com/search/issues?q=type:pr+author:${username}+created:${since}..${until}`,
      { headers }
    );
    const prData = await prRes.json();
    prCount = prData.total_count ?? 0;
  } catch (err) {
    resultDiv.textContent = `PR取得エラー: ${err.message}`;
    resultDiv.classList.remove('loading');
    return;
  }

  // コミット数取得（全リポジトリ合算）
  let commitCount = 0;
  try {
    let page = 1, hasNext = true;
    while (hasNext) {
      const repoRes = await fetch(
        `https://api.github.com/users/${username}/repos?per_page=100&page=${page}`,
        { headers }
      );
      const repos = await repoRes.json();
      if (!Array.isArray(repos) || !repos.length) break;
      for (const repo of repos) {
        let cPage = 1, cHasNext = true;
        while (cHasNext) {
          const commitRes = await fetch(
            `https://api.github.com/repos/${repo.owner.login}/${repo.name}/commits?author=${username}&since=${since}&until=${until}&per_page=100&page=${cPage}`,
            { headers }
          );
          const commits = await commitRes.json();
          if (!Array.isArray(commits) || !commits.length) break;
          commitCount += commits.length;
          cHasNext = commits.length === 100;
          cPage++;
        }
      }
      hasNext = repos.length === 100;
      page++;
    }
  } catch (err) {
    resultDiv.textContent = `コミット取得エラー: ${err.message}`;
    resultDiv.classList.remove('loading');
    return;
  }

  resultDiv.textContent =
    `${year}年${month}月の ${username} さんの\n` +
    `Pull Request数: ${prCount}\n` +
    `コミット数: ${commitCount}`;
  resultDiv.classList.remove('loading');
});

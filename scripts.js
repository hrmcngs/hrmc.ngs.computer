document.getElementById('convertButton').addEventListener('click', () => {
    const mcfunctionContent = document.getElementById('mcfunctionInput').value;
    fetch('https://api.openai.com/v1/engines/davinci-codex/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer YOUR_OPENAI_API_KEY'
        },
        body: JSON.stringify({
            prompt: `Convert the following mcfunction code to Java:\n\n${mcfunctionContent}`,
            max_tokens: 1000
        })
    })
    .then(response => response.json())
    .then(data => {
        const javaCode = data.choices[0].text.trim();
        document.getElementById('javaOutput').textContent = javaCode;
    })
    .catch(error => console.error('Error:', error));
});

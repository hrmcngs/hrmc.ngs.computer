document.getElementById('convertButton').addEventListener('click', () => {
    const mcfunctionContent = document.getElementById('mcfunctionInput').value;
    fetch('/convert', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: mcfunctionContent })
    })
    .then(response => response.json())
    .then(data => {
        document.getElementById('javaOutput').textContent = data.javaCode;
    })
    .catch(error => console.error('Error:', error));
});


from flask import Flask, request, jsonify
import openai

app = Flask(__name__)

# OpenAI APIキーの設定
openai.api_key = 'your_openai_api_key'

@app.route('/convert', methods=['POST'])
def convert():
    data = request.json
    mcfunction_content = data['content']

    # AIモデルを使用してmcfunction内容をJavaコードに変換
    response = openai.Completion.create(
        model="text-davinci-003",
        prompt=f"Convert the following mcfunction code to Java:\n\n{mcfunction_content}",
        max_tokens=1000
    )
    java_code = response.choices[0].text.strip()

    return jsonify({'javaCode': java_code})

if __name__ == '__main__':
    app.run(debug=True)

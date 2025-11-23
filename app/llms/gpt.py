import os
import time
from dotenv import load_dotenv
from litellm import completion

load_dotenv()

def prompt_completion_chat(question="", model="anthropic/claude-sonnet-4-5-20250929", n=1, temperature=0.2, max_tokens=256, system_description="You write song lyrics. You write lyrics without annotations like \"Chorus\" or \"Verse 1\", which you know might mess up the singer", messages=None, stop=None):
    start_time = time.perf_counter()
    prompt = f"{question} "
    response = completion(
        model=model,
        messages=messages if messages is not None else [
            {"role": "system", "content": system_description},
            {"role": "user", "content": prompt},
        ],
        max_tokens=max_tokens,
        temperature=temperature,
        n=n,
        stop=stop,
    )
    # print(response)
    answers = []
    for i in range(n):
        ans = response.choices[i].message.content.strip()
        # Sometimes it quotes the response, so strip those off
        if ans[0] == "\"" and ans[-1] == "\"":
            ans = ans[1:-1]
        answers.append(ans)
    # print(f"\tPROMPT: {question}\n\tANSWER: {answer}\n")
    duration = time.perf_counter() - start_time
    short_answer = answers[0][:20].replace('\n', ' ')
    # print(f"Duration: {duration:.2f} seconds: {short_answer}...")
    if n == 1:
        return answers[0]
    return

def prompt_completion_json(messages, model="anthropic/claude-sonnet-4-5-20250929", temperature=0.2, max_tokens=1000):
    response = completion(
        model=model,
        messages=messages + [{"role": "system", "content": "You must respond with valid JSON only."}],
        temperature=temperature,
        max_tokens=max_tokens,
        response_format={"type": "json_object"}
    )
    return response.choices[0].message.content

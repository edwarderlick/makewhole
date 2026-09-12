import re
with open('studio.js', 'r', encoding='utf-8') as f:
    content = f.read()

# We want to extract the hello world contract from the JS string.
matches = re.findall(r'# \{ "Depends": [^`]*', content)
for m in matches[:1]:
    # take up to 1000 characters
    print(m[:1000])

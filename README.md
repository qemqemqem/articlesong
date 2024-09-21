# Article Song

A project to create a browser plugin that will take the text of your current page and send it to an AI music generation service, to create a song based on the text of the article.

# Notes

Some things you need to do for this:
 * `sudo cp app/article_singer.json /usr/lib/mozilla/native-messaging-hosts/`
 * Go here: `about:debugging#/runtime/this-firefox` and add the `manifest.json` file as a Temporary Extension.
 * Go to a website, click the button. You should hear a brief sin wave tone.

# Next Steps

Something like https://suno.gcui.art/ to get an API to Suno, which doesn't have an official one yet.


// importing puppeteer, path, and express modules
const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');

// import node.js wrapper for Spotify API
const SpotifyWebApi = require('spotify-web-api-node');

//credentials needed for authorization to SpotifyAPI
const client_id = '74ea59c40ece4340b100cf01b50c7fe9';
const client_secret = 'd27f5b671984487c8ea837b146883c4e';
const redirect_uri = 'http://localhost:3000/callback';

// instantiating spotify API wrapper
const spotifyApi = new SpotifyWebApi({
  redirectUri: redirect_uri,
  clientId: client_id,
  clientSecret: client_secret
});

const scope = [
    'playlist-modify-public',
    'playlist-modify-private',
    'user-follow-modify'
];

const app = express();
const port = 3000;


// function to take in an apple playlist and return an array of objects containing the song title + artist

const readPlaylist = async(applePlaylist) => {
    try {
        const browser = await puppeteer.launch({headless: "new", args: ['--no-sandbox']});
        const page = await browser.newPage();
        await page.goto(applePlaylist);
        await page.waitForSelector("div.songs-list-row__song-name");
        const playlist_length = await page.$$eval("div.songs-list-row__song-name", el => el.length);
        const playlist_contents = [];


        for (let index = 0; index < playlist_length; index++) {
            try {
                const song_info = new Object();

                let title = await page.evaluate(el => el.innerHTML,
                                                            (await page.$$("div.songs-list-row__song-name"))[index]);

                title = title.replace(/&amp;/g, '&');

                if (title.indexOf("(feat.") != -1) {
                    title = title.substring(0, title.indexOf("(feat.") - 1);
                }

                song_info.title = title;
                song_info.artist = null;

                playlist_contents.push(song_info);

            } catch (error) {
                console.log(error);
                return;
            }
        }

        try {
            const containers = await page.$$("div.songs-list__col--secondary");

            for (let index = 0; index < containers.length; index++) {
                if (index == 0) continue;
                var artist = await containers[index].$eval('div', el => el.innerHTML);
                const starting_index = artist.indexOf("\">") + 2;
                var ending_index = starting_index;
                while (artist[ending_index] != "<") {
                    ending_index++;
                }
                artist = artist.substring(starting_index, ending_index);
                playlist_contents[index - 1].artist = artist;
            }

        } catch (error) {
            console.log(error);
            return;
        }

        return playlist_contents;
        await browser.close();

    } catch (error) {
        console.log(error);
        return;
    }
}

const convertPlaylist = async() => {

    var data =  await spotifyApi.createPlaylist('test for SpotifyIfy', {'public': true});

    console.log("created playlist: ", data.body.uri);
    parts = data.body.uri.split(":");
    playlist_id = parts[parts.length - 1];

    return playlist_id;

}

const getSongURIs = async(applePlaylist) => {

    const song_uris = [];

    const playlist_contents = await readPlaylist(applePlaylist);

    console.log("playlist_contents: ", playlist_contents, playlist_contents.length, " items");

    for (let i = 0; i < Math.floor(playlist_contents.length / 99) + 1; i++) {
        let list = []
        song_uris.push(list);
    }

    console.log("song_uris: ", song_uris);

    for (let index = 0; index < playlist_contents.length; index++) {
        try {
            let data = await spotifyApi.searchTracks(`track:${playlist_contents[index].title} artist:${playlist_contents[index].artist}`);

            console.log(`${index}: ${data.body.tracks.items[0].uri}: ${playlist_contents[index].title} by ${playlist_contents[index].artist}`);

            song_uris[Math.floor(index / 99)].push(data.body.tracks.items[0].uri);
            console.log(index);
        }
        catch (err) {
            console.log(`${playlist_contents[index].title} could not be added as it was not found on spotify`);
            continue;
        }
    }

    return song_uris;

}

const addSongs = async(applePlaylist) => {

    const playlist_id = await convertPlaylist();

    const song_uris = await getSongURIs(applePlaylist);

    console.log("playlist_id: ", playlist_id);

    for (let i = 0; i < song_uris.length; i++) {
        spotifyApi.addTracksToPlaylist(playlist_id, song_uris[i])
         .then(function(data) {
            console.log(`added songs to playlist, no error`);
        }, function(error) {
            console.log(`couldn't add songs to playlist because:`, error);
        });
    }

}

app.get('/', function(req,res) {
    res.redirect("http://localhost:3000/authorize");
})

app.get('/authorize', function(req, res) {
    res.redirect(spotifyApi.createAuthorizeURL(scope));
})

app.get('/callback', function(req, res) {
    const err = req.query.error;
    const code = req.query.code;
    const state = req.query.state;

    if (err) {
        console.error(err);
        res.send(`Error: ${err}`);
        return;
    }

    spotifyApi.authorizationCodeGrant(code)
     .then(data => {
        const access_token = data.body['access_token'];
        const refresh_token = data.body['refresh_token'];
        const time_remaining = data.body['expires_in'];

        spotifyApi.setAccessToken(access_token);
        spotifyApi.setRefreshToken(refresh_token);

        console.log(`Access token: ${access_token}`);
        console.log(`Refresh token: ${refresh_token}`);
        console.log(`Retrieved token, expires in: ${time_remaining}`);
        

        setInterval(async () => {
            const data = await spotifyApi.refreshAccessToken();
            const access_token = data.body['access_token'];

            console.log(`Refreshed access token: ${access_token}`);
            console.log(`Retrieved token, expires in: ${time_remaining}`);
            spotifyApi.setAccessToken(access_token);
            
        }, time_remaining * 1000 - 600000);

        res.redirect("http://localhost:3000/home");
    })
     .catch(err => {
        console.error("error getting authorization:", err);
        res.send(`Error: ${err}`);
    });
})

app.get('/home', function(req, res) {
    res.sendFile(path.join(__dirname,'public', 'index.html'));
})

app.get('/submit', function(req, res) {
    let playlist = req.query.playlist_input;

    addSongs(playlist);

    res.sendFile(path.join(__dirname,'public', 'submit.html'));
})

app.listen(port, function(err) {
    if (err) {
        console.log("Error listening\n", err);
    }
    console.log("listening on http://localhost:", port);
})
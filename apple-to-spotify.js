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
  clientId: client_id,
  clientSecret: client_secret,
  redirectUri: redirect_uri
});

const scope = [
    'playlist-modify-public',
    'playlist-modify-private',
    'user-follow-modify'
];

const app = express();
const port = 3000;

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
        
        res.sendFile(path.join(__dirname,'public', 'index.html'));

        setInterval(async () => {
            const data = await spotifyApi.refreshAccessToken();
            const access_token = data.body['access_token'];

            console.log(`Refreshed access token: ${access_token}`);
            console.log(`Retrieved token, expires in: ${time_remaining}`);
            spotifyApi.setAccessToken(access_token);
            
        }, time_remaining * 1000 - 600000);

        async function convertPlaylist() {
            const playlist_id = null;
            spotifyApi.createPlaylist('test for SpotifyIfy', {'public': true})
             .then(function(data) {
                playlist_id = data.uri;
             }, function(error) {
                console.log(error);
             });

            await readPlaylist()
             .then(playlist_contents => {
                for (let index = 0; index < playlist_contents.length; index++) {
                    spotifyApi.searchTracks(`track:${playlist_contents[index].title} artist:${playlist_contents[index].artist}`)
                     .then(function(data) {
                        console.log(`${data.body.tracks.items[0].uri}: ${playlist_contents[index].title} by ${playlist_contents[index].artist}`);

                        spotifyApi.addTracksToPlaylist(playlist_id, data.body.tracks.items[0].uri)
                         .then(function(data) {
                            console.log(`added ${playlist_contents[index].title} by ${playlist_contents[index].artist} to playlist`);
                         }, function(error) {
                            console.log(`couldn't add ${playlist_contents[index].title} by ${playlist_contents[index].artist} to playlist because:`, error);
                         });

                     }, function(error) {
                        console.log(error);
                     });

                }
            });
        }


        convertPlaylist();
    })
     .catch(err => {
        console.error(err);
        res.send(`Error: ${err}`);
     });

})

// function to take in an apple playlist and return an array with
// each song in it.

const readPlaylist = async() => {
    const applePlaylist = "https://music.apple.com/us/playlist/2023-essentials/pl.u-6mo4je8UKvbBD1";

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

app.listen(port, function(err) {
    if (err) {
        console.log("Error listening\n", err);
    }
    console.log("listening on http://localhost:", port);
})
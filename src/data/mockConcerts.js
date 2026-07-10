// ─── MOCK SETLISTS ─────────────────────────────────────────────────────────────
// TODO: Replace with setlist.fm API — GET https://api.setlist.fm/rest/1.0/search/setlists?artistName=BTS
export const MOCK_SETLISTS = {
  "bts-dallas": {
    songs:[
      {order:1, title:"Dynamite", note:"Opening · fan chant heavy"},
      {order:2, title:"Butter", note:"Crowd goes wild"},
      {order:3, title:"Boy With Luv", note:"Pink confetti drop"},
      {order:4, title:"DNA"},
      {order:5, title:"Fake Love", note:"Emotional peak"},
      {order:6, title:"MIC Drop"},
      {order:7, title:"ON", note:"Full choreo · breathtaking"},
      {order:8, title:"Spring Day", note:"Everyone cries here"},
      {order:9, title:"Life Goes On"},
      {order:10, title:"Black Swan", note:"Solo spotlight set"},
      {order:11, title:"Idol", note:"Encore opener"},
      {order:12, title:"Permission to Dance", note:"Closing · light sticks out"},
    ],
    source:"fan-reported", verified:true, lastShow:"Dallas Night 1",
  },
  "skz-chicago": {
    songs:[
      {order:1, title:"MIROH", note:"Hype opener"},
      {order:2, title:"MANIAC"},
      {order:3, title:"Thunderous"},
      {order:4, title:"Rock", note:"Mosh energy"},
      {order:5, title:"Social Path"},
      {order:6, title:"God's Menu"},
      {order:7, title:"District 9"},
      {order:8, title:"Back Door"},
      {order:9, title:"Levanter", note:"Emotional ballad set"},
      {order:10, title:"Christmas EveL"},
      {order:11, title:"S-Class", note:"Encore"},
    ],
    source:"fan-reported", verified:false, lastShow:"Chicago Night 1",
  },
};

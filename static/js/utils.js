
export const seconds_to_hms = _seconds_to_hms;
export const stringToHHMMSS = _stringToHHMMSS;
export const random_rgba = _random_rgba;

function _seconds_to_hms(sec_num) {
    var hours   = Math.floor(sec_num / 3600);
    var minutes = Math.floor((sec_num - (hours * 3600)) / 60);
    var seconds = sec_num - (hours * 3600) - (minutes * 60);

    if (seconds < 10) {seconds = "0"+seconds;}

    if (hours == 0){
        return minutes + 'm ' + seconds + 's';
    }
    return hours + 'h ' + minutes + 'm ' + seconds + 's';
}

function _stringToHHMMSS(string_in) {
    var sec_num = parseInt(string_in, 10); // don't forget the second param
    var hours   = Math.floor(sec_num / 3600);
    var minutes = Math.floor((sec_num - (hours * 3600)) / 60);
    var seconds = sec_num - (hours * 3600) - (minutes * 60);

    if (hours   < 10 && hours > 0) {hours   = "0"+hours;}

    if (seconds < 10) {seconds = "0"+seconds;}

    if (hours == 0){
        return minutes + 'm ' + seconds + 's';
    }
    return hours + 'h ' + minutes + 'm ' + seconds + 's';
}

function _random_rgba(alpha) {
    var o = Math.round, r = Math.random, s = 255;
    if(alpha == undefined){
        return 'rgba(' + o(r()*s) + ',' + o(r()*s) + ',' + o(r()*s) + ',' + ".5" + ')';
    }
        return 'rgba(' + o(r()*s) + ',' + o(r()*s) + ',' + o(r()*s) + ',' + "1" + ')';
    }
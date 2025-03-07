import sys
import time
import jieba
from pathlib import Path
from wordcloud import WordCloud, STOPWORDS


def clean_files(out_folder: Path):
    # 清理 3 天的过期文件
    cutoff = time.time() - 3600 * 24 * 3
    clean_count = 0
    for file in out_folder.glob("*"):
        if file.is_file() and file.stat().st_birthtime < cutoff:
            file.unlink()
            clean_count += 1
    print(f"Cleaned {clean_count} old files")


def main():
    try:
        file_path = sys.argv[1]
        param = sys.argv[2]
        print(id, param)
        file_dir = Path(__file__).resolve().parent
        userdict_path = file_dir / "userdict.txt"
        stopwords_path = file_dir / "stopwords.txt"
        font_path = file_dir / "font.otf"
        out_dir = file_dir / "out"
        if not out_dir.exists():
            out_dir.mkdir()
        out_file = file_path
        # 用户词典
        with open(userdict_path, encoding="utf-8") as f_user:
            f_user_text = f_user.read()
            userdict_list = f_user_text.splitlines()
        # 分词
        for word in userdict_list:
            jieba.add_word(word)
        splits = jieba.cut(param)
        with open(stopwords_path, encoding="utf-8") as f_stop:
            f_stop_text = f_stop.read()
            f_stop_seg_list = f_stop_text.splitlines()
        words = []
        for split in splits:
            word = split.strip()
            if len(word) >= 2 and word not in f_stop_seg_list:
                words.append(word)
        if len(words) == 0:
            raise Exception("not enough words")
        print(words)
        # 前 100 个高频词汇
        wc = WordCloud(
            font_path=font_path,
            width=1280,
            height=720,
            max_words=100,
            stopwords=set(STOPWORDS),
            background_color="white",
        )
        wc.generate(" ".join(words))
        wc.to_file(out_file)
        print("Wordcloud saved to", out_file)

    except Exception as e:
        print(e)


main()

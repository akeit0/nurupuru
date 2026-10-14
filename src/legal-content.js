// Shared policy text for the editor and standalone pages. Keep both languages in sync.
export const LEGAL_UPDATED='2026-10-14';
import { GITHUB_REPOSITORY } from './app-info.js';
export const LEGAL_CONTACT=GITHUB_REPOSITORY+'/issues';
export const GITHUB_PRIVACY='https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement';
export const LEGAL={
  ja:{
    updated:'最終更新',contact:'お問い合わせ',close:'閉じる',back:'編集画面に戻る',
    terms:{title:'利用規約',intro:'本アプリ「ぬるぷる」は、無料で利用できる画像・動画編集ツールです。',clauses:[
      ['利用について','本アプリは個人開発の無料サービスです。予告なく機能の変更や公開の終了を行う場合があります。'],
      ['著作権・肖像権','利用する画像・動画については、利用者自身で必要な権利や許諾を確認してください。第三者の権利を侵害する利用や違法な利用は禁止します。'],
      ['作成したコンテンツ','本アプリの運営者は、利用者が作成した画像・動画について、本アプリの利用のみを理由として権利を主張しません。'],
      ['データの取り扱い','画像・動画の編集処理はブラウザ内で行われ、運営者のサーバーにはアップロード・保存されません。'],
      ['免責事項','本アプリは現状のまま提供されます。動作や編集結果を保証するものではありません。運営者の責任は、適用法令で認められる範囲で制限されます。'],
    ],closing:'本規約には日本法を適用します。日本語版と英語版に相違がある場合は、日本語版を優先します。'},
    privacy:{title:'プライバシーポリシー',intro:'本アプリは、利用者のプライバシーを尊重します。',clauses:[
      ['画像・動画データ','編集対象の画像・動画はブラウザ内で処理されます。運営者はこれらのファイルを収集・保存しません。'],
      ['端末内の設定','言語・テーマ・表示設定は、ブラウザのlocalStorageに保存します。これらの設定を運営者に送信することはありません。画像・動画をlocalStorageに保存することはありません。'],
      ['アクセス解析・広告','本アプリはアクセス解析ツールや広告を使用していません。追跡を目的としたCookieも使用しません。'],
      ['GitHub Pagesについて','GitHub Pagesで公開されるバージョンでは、GitHubがセキュリティ等の目的でアクセス元のIPアドレスを記録・保存します。'],
      ['お問い合わせ','お問い合わせで提供された情報は、回答や必要な連絡のためにのみ使用します。GitHub Issuesでのお問い合わせはGitHub上で処理され、投稿内容が公開される場合があります。'],
    ],closing:'GitHubのプライバシーに関する情報は、GitHub Privacy Statementをご確認ください。'},
  },
  en:{
    updated:'Last updated',contact:'Contact',close:'Close',back:'Back to the editor',
    terms:{title:'Terms of Use',intro:'This app, "Nurupuru," is a free image and video editing tool.',clauses:[
      ['Use of the App','This is a free, independently developed application. Features may change, and the service may be discontinued without prior notice.'],
      ['Copyright and Rights','Users are responsible for ensuring they have the necessary rights or permissions for any images or videos they use. Illegal use and infringement of third-party rights are prohibited.'],
      ['Created Content','The developer does not claim ownership of content created by users solely because they used this app.'],
      ['Data Processing',"Images and videos are processed locally in your browser. They are not uploaded to or stored on the developer's servers."],
      ['Disclaimer','This app is provided "as is," without guarantees regarding functionality or results. The developer\'s liability is limited to the extent permitted by applicable law.'],
    ],closing:'These terms are governed by Japanese law. In case of any discrepancy, the Japanese version takes precedence.'},
    privacy:{title:'Privacy Policy',intro:'This app respects your privacy.',clauses:[
      ['Image and Video Data','Images and videos are processed locally in your browser. The developer does not collect or store these files.'],
      ['Local Preferences','Language, theme and display preferences are stored in your browser\'s localStorage. These settings are not sent to the developer. Images and videos are not saved in localStorage.'],
      ['Analytics and Advertising','This app does not use analytics tools, advertising, or tracking cookies.'],
      ['GitHub Pages','For versions hosted on GitHub Pages, GitHub logs and stores visitors\' IP addresses for security purposes.'],
      ['Contact Information','Information provided through inquiries is used only to respond and communicate when necessary. Inquiries through GitHub Issues are processed by GitHub and may be public.'],
    ],closing:'For more information, please refer to the GitHub Privacy Statement.'},
  },
};

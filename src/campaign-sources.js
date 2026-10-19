export const caseSources = {
  "tmall-2024": {
    title: "淘宝天猫 2024 双十一安排",
    context:
      "主体 / 市场：阿里巴巴、淘宝天猫；中国内地。公告：2024-10-14；历史活动。",
    fact: "该年预售于 10 月 14 日开启，两段结算窗口为 10 月 21–24 日、10 月 31 日–11 月 11 日；平台提供会员权益、跨平台流量支持、AI 工具和退货服务，并提及内地用户可使用微信支付。",
    limits:
      "商家级预算、补贴实际到账、流量分配算法、支付成功率和利润；不能把 2024 时间表直接用于 2026。",
    url: "https://www.alibabagroup.com/en-US/document-1784016094848090112",
    links: [
      {
        title: "阿里巴巴官方活动安排",
        url: "https://www.alibabagroup.com/en-US/document-1784016094848090112",
      },
    ],
    verified: "2026-10-19",
  },
  "tmall-review": {
    title: "淘宝天猫 2024 双十一复盘",
    context:
      "主体 / 市场：阿里巴巴、淘宝天猫；中国内地。发布：2024-11-12；活动期 2024-10-14 至 11-11。",
    fact: "589 个品牌 GMV 超过人民币 1 亿元，45 个品牌超过 10 亿元。公告把 GMV 定义为平台已支付订单金额，包含适用运费；所列数字未经审计、可调整。也披露 AI 工具应用。",
    limits:
      "总 GMV 精确值、增量广告贡献、品牌利润、对照组与内部实验数据；战报不能证明某工具造成全部增长。",
    url: "https://www.alibabagroup.com/en-US/document-1792798062653997056",
    links: [
      {
        title: "阿里巴巴官方战报",
        url: "https://www.alibabagroup.com/en-US/document-1792798062653997056",
      },
    ],
    verified: "2026-10-19",
  },
  "tt-sambal": {
    title: "Eatsambel 调味酱内容与购物广告",
    context:
      "主体 / 市场：TikTok for Business 发布的 Eatsambel 案例；印度尼西亚。本页未标明活动及发布日期；按历史案例处理。",
    fact: "品牌复用表现好的自然视频，配合 Video Shopping Ads 商品卡与链接；直播延续内容风格，并使用 LIVE Shopping Ads。页面自报整体 ROAS 超过 11 倍。",
    limits:
      "该品牌是中国出海品牌、蟹黄酱品牌，或当前印尼仍采用相同广告配置；未披露可复现实验、退款后利润、完整归因口径。ROAS 不设为玩家保证结果。",
    url: "https://ads.tiktok.com/business/en/inspiration/eatsambel?redirected=1",
    links: [
      {
        title: "TikTok 官方 Eatsambel 案例",
        url: "https://ads.tiktok.com/business/en/inspiration/eatsambel?redirected=1",
      },
    ],
    verified: "2026-10-19",
  },
  "dana-lazada": {
    title: "DANA 与 Lazada 支付整合",
    context:
      "主体 / 市场：DANA 帮助中心；印度尼西亚。页面未注明发布日期；2026-10-19 核验。",
    fact: "DANA 官方确认可在 Lazada 作为无现金支付方式。",
    limits:
      "上线日期、转化提升、费用、风控阈值；该页没有证明整合经由 Alipay+，不得拼接为同一技术案例。也不证明任何新商家自动获得同样支付能力。",
    url: "https://www.dana.id/help-center/article/what-is-dana-x-lazada-integration",
    links: [
      {
        title: "DANA 官方帮助页",
        url: "https://www.dana.id/help-center/article/what-is-dana-x-lazada-integration",
      },
    ],
    verified: "2026-10-19",
  },
  "alipay-changi": {
    title: "Changi Pay 加入 Alipay+ 跨境网络",
    context:
      "主体 / 路线：Changi Airport Group、Liquid Group、Ant Group；新加坡钱包用户赴中国消费。公告正文日期 2023-09-20；托管新闻页时间显示为 2023-09-19 18:25，不混同。",
    fact: "Changi Pay 结合 Liquid Group 账户接入 Alipay+，支持旅行者在中国相应商户扫码支付。",
    limits:
      "这是新加坡本地电商收单案例、该钱包支持所有市场、商户实际费率或成功率；公告历史优惠不当作现行政策。",
    url: "https://www.mynewsdesk.com/sg/changiairport/pressreleases/changi-pay-digital-wallet-launches-new-feature-to-make-shopping-and-dining-internationally-a-breeze-3273978",
    links: [
      {
        title: "樟宜机场官方新闻稿（Mynewsdesk 托管）",
        url: "https://www.mynewsdesk.com/sg/changiairport/pressreleases/changi-pay-digital-wallet-launches-new-feature-to-make-shopping-and-dining-internationally-a-breeze-3273978",
      },
    ],
    verified: "2026-10-19",
  },
  "alipay-refund": {
    title: "Alipay+ 退款接口的状态与幂等规则",
    context:
      "主体 / 范围：Alipay+ 官方开发文档；收单合作伙伴 ACQP 接口，非某商户经营战报。固定引用 pageVersion=20；页面未显示发布日期，2026-10-19 核验。",
    fact: "支持全额或部分退款，累计不得超过原支付金额；未知状态或超时重试须复用 refundRequestId。文档区分成功、失败与未知状态。",
    limits:
      "DANA/Lazada 必然调用此接口、所有钱包退款时效一致、每个商户能直接调用 ACQP API。关卡异常率与损失金额必须为模拟。",
    url: "https://docs.alipayplus.com/alipayplus/alipayplus/api_acq_tile/refund?pageVersion=20",
    links: [
      {
        title: "Alipay+ 官方 refund API",
        url: "https://docs.alipayplus.com/alipayplus/alipayplus/api_acq_tile/refund?pageVersion=20",
      },
    ],
    verified: "2026-10-19",
  },
  "lkk-global": {
    title: "李锦记中国酱料的海外经营类比",
    context:
      "主体 / 市场：李锦记；中国香港总部，全球业务。企业介绍未标发布日期；2026-10-19 核验。",
    fact: "官网披露产品销往超过 100 个国家与地区，提供超过 300 种酱料及调味品，并在马来西亚等地设生产基地。",
    limits:
      "李锦记的成熟网络可以复制给新品牌；未核实其蟹黄酱出海成功案例，也没有用户品牌的销量、准入资格或试吃结果。",
    url: "https://corporate.lkk.com/en/about-lkk/overview",
    links: [
      {
        title: "李锦记官方企业介绍",
        url: "https://corporate.lkk.com/en/about-lkk/overview",
      },
    ],
    verified: "2026-10-19",
  },
  "sfa-import": {
    title: "新加坡食品分类",
    context:
      "主体 / 地区：Singapore Food Agency（SFA）；新加坡。正文更新：2026-09-07。",
    fact: "鱼及鱼产品分类包含蟹等甲壳类及其加工、罐装形态；“加工过”不代表自动归入 Processed Food。分类决定后续所需条件。",
    limits:
      "本材料没有为某个蟹黄酱 SKU 作正式分类，也没有确认来源国、工厂或商品获准。马来西亚、印尼须另查当地规则。",
    url: "https://www.sfa.gov.sg/food-import-export/general-classification-of-food-food-products/classification-of-general-food-food-products",
    links: [
      {
        title: "SFA 官方食品分类",
        url: "https://www.sfa.gov.sg/food-import-export/general-classification-of-food-food-products/classification-of-general-food-food-products",
      },
    ],
    verified: "2026-10-19",
  },
  "sfa-permit": {
    title: "新加坡商业进口流程",
    context: "主体 / 地区：SFA；新加坡。正文更新：2026-09-07。",
    fact: "进口鱼产品需要相应许可证；Processed Food 采用相应注册要求。商业进口还涉及批次进口许可；适用时须通过检查及检测才能销售，邮寄销售也不能跳过商业进口要求。",
    limits:
      "只提炼启动门槛，不提供完整申报方案；不据此断言蟹黄酱合法可售、无需检验，或全部海鲜均使用相同文件。",
    url: "https://www.sfa.gov.sg/food-import-export/commercial-imports/what-you-need-to-know-for-import-of-food",
    links: [
      {
        title: "SFA 官方商业进口说明",
        url: "https://www.sfa.gov.sg/food-import-export/commercial-imports/what-you-need-to-know-for-import-of-food",
      },
    ],
    verified: "2026-10-19",
  },
  "sfa-labels": {
    title: "新加坡预包装食品标签与蟹类过敏原",
    context:
      "主体 / 地区：SFA；新加坡。官方入口正文更新 2025-12-30；链接指南含 2026-01-30 生效条款。核验：2026-10-19。",
    fact: "预包装食品须满足英文强制信息要求，包括成分及相关过敏原、净含量、本地责任企业名称地址及原产国；指南过敏原组列有蟹及其产品。2026-01-30 起还涉及批次识别、适用的安全使用或处理说明。",
    limits:
      "营养或健康声称可能涉及额外要求；这份简表不是完整标签审查。没有配方、工艺、检测和保质期依据时，不填写虚构认证、保质期或“常温安全”承诺。",
    url: "https://www.sfa.gov.sg/regulatory-standards-frameworks-guidelines/food-labelling-packaging-guidelines/labelling-requirements-for-food",
    links: [
      {
        title: "SFA 标签要求入口",
        url: "https://www.sfa.gov.sg/regulatory-standards-frameworks-guidelines/food-labelling-packaging-guidelines/labelling-requirements-for-food",
      },
      {
        title: "SFA 官方标签指南 PDF",
        url: "https://www.sfa.gov.sg/docs/default-source/food-information/labelling-and-packaging-information/a-guide-to-food-labelling-and-advertisements.pdf",
      },
    ],
    verified: "2026-10-19",
  },
};
